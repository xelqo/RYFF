#!/usr/bin/env python3
"""Loopstack audio analysis. Runs INSIDE the Daytona sandbox and needs only numpy.

  hit      python3 analyse.py take.wav --kind hit --out DIR
  hum      python3 analyse.py take.wav --kind melody|bass --bpm 80 --tonic 57 --scale minor \
               --steps 32 --pre-roll 0.15 --out DIR
  texture  python3 analyse.py take.wav --kind texture --bpm 80 --steps 32 --pre-roll 0.15 --out DIR

The take is a 16-bit PCM WAV. For melody/bass/texture the browser starts recording `pre-roll`
seconds before the loop's first downbeat, so take time `pre_roll` == loop position 0.

Prints exactly one JSON object as the last line of stdout. Exit code is always 0 so the caller can
read errors from the JSON.
"""
import argparse
import json
import os
import sys
import wave

import numpy as np

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "chromatic": list(range(12)),   # no snapping: used to detect the key of a hum
}


# ---------------------------------------------------------------- wav io
def read_wav(path):
    with wave.open(path, "rb") as w:
        sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    if sw == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif sw == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float32) / 2147483648.0
    elif sw == 1:
        x = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        raise ValueError(f"unsupported sample width {sw}")
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, sr


def write_wav(path, x, sr):
    pcm = (np.clip(x, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())


def normalize(x, peak=0.9):
    m = float(np.abs(x).max()) if len(x) else 0.0
    return x * (peak / m) if m > 1e-5 else x


# ---------------------------------------------------------------- helpers
def frame(x, n, hop):
    if len(x) < n:
        x = np.pad(x, (0, n - len(x)))
    count = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(count)[:, None]
    return x[idx]


def onset_strength(x, sr, n=1024, hop=256):
    frames = frame(x, n, hop)
    mag = np.log1p(50.0 * np.abs(np.fft.rfft(frames * np.hanning(n), axis=1)))
    flux = np.r_[0.0, np.maximum(0.0, np.diff(mag, axis=0)).sum(axis=1)]
    rms = np.sqrt((frames ** 2).mean(axis=1))
    times = (np.arange(len(flux)) * hop + n / 2) / sr
    return flux, rms, times


def pick_onsets(flux, rms, times, min_gap):
    if len(flux) < 3 or flux.max() <= 0:
        return []
    env = flux / flux.max()
    gate = max(float(np.percentile(rms, 20)) * 4.0, 0.006)
    k = 8
    padded = np.pad(env, k, mode="edge")
    local = np.array([np.median(padded[i:i + 2 * k + 1]) for i in range(len(env))])
    peaks = []
    for i in range(1, len(env) - 1):
        if env[i] < env[i - 1] or env[i] < env[i + 1]:
            continue
        if env[i] < 0.15 or env[i] < local[i] + 0.1:
            continue
        if rms[i:min(len(rms), i + 3)].max() < gate:
            continue
        if peaks and times[i] - times[peaks[-1]] < min_gap:
            if env[i] > env[peaks[-1]]:
                peaks[-1] = i
            continue
        peaks.append(i)
    return peaks


def smooth_env(x, sr, ms=5.0):
    w = max(1, int(sr * ms / 1000))
    return np.convolve(np.abs(x), np.ones(w) / w, mode="same")


# ---------------------------------------------------------------- hit
def refine_attack(x, sr, t):
    a, b = max(0, int((t - 0.06) * sr)), min(len(x), int((t + 0.03) * sr))
    if b <= a:
        return max(0.0, t)
    seg = np.abs(x[a:b])
    above = np.nonzero(seg > 0.25 * seg.max())[0]
    first = a + (int(above[0]) if len(above) else 0)
    return max(0.0, first / sr - 0.004)


def classify_hit(seg, sr):
    a = seg[: max(64, int(0.06 * sr))]
    power = np.abs(np.fft.rfft(a * np.hanning(len(a)), n=4096)) ** 2
    freqs = np.fft.rfftfreq(4096, 1.0 / sr)
    centroid = float((power * freqs).sum() / max(power.sum(), 1e-12))
    env = smooth_env(seg, sr)
    peak_i = int(np.argmax(env))
    below = np.nonzero(env[peak_i:] < 0.1 * env[peak_i])[0]
    decay = float((below[0] if len(below) else len(env) - peak_i) / sr)
    if centroid < 600:
        slot = "kick"
    elif centroid > 6000:
        slot = "hat"
    elif centroid >= 1200:
        slot = "snare"
    else:
        slot = "perc"
    return slot, centroid, decay


def analyse_hit(x, sr, out):
    flux, rms, times = onset_strength(x, sr)
    peaks = pick_onsets(flux, rms, times, 0.08)
    if not peaks:
        return {"ok": True, "kind": "hit", "hits": 0,
                "message": "I couldn't hear a clear hit. Try again a bit louder or closer to the mic."}
    onsets = [float(times[p]) for p in peaks]
    dur = len(x) / sr
    best, best_score = None, -1.0
    for i, t in enumerate(onsets):
        start = refine_attack(x, sr, t)
        nxt = onsets[i + 1] if i + 1 < len(onsets) else dur
        end = min(start + 0.45, nxt - 0.01, dur)
        if end - start < 0.05:
            continue
        seg = x[int(start * sr):int(end * sr)]
        clipped = float((np.abs(seg) > 0.98).mean())
        score = float(np.abs(seg).max()) * max(0.0, 1 - 5 * clipped) * min(1.0, (end - start) / 0.15)
        if score > best_score:
            best, best_score = (start, end), score
    if best is None:
        start = refine_attack(x, sr, onsets[0])
        best = (start, min(dur, start + 0.3))
    seg = x[int(best[0] * sr):int(best[1] * sr)].astype(np.float32).copy()

    # trim the tail once it has decayed, then fade in/out so it never clicks
    env = smooth_env(seg, sr)
    peak_i = int(np.argmax(env))
    quiet = np.nonzero(env[peak_i:] < 0.02 * env[peak_i])[0]
    if len(quiet):
        seg = seg[: min(len(seg), peak_i + int(quiet[0]) + int(0.02 * sr))]
    fi, fo = min(len(seg), int(0.003 * sr)), min(len(seg), int(len(seg) * 0.35))
    if fi:
        seg[:fi] *= np.linspace(0, 1, fi)
    if fo:
        seg[-fo:] *= np.linspace(1, 0, fo) ** 2
    seg = normalize(seg, 0.9)
    slot, centroid, decay = classify_hit(seg, sr)
    write_wav(os.path.join(out, "hit.wav"), seg, sr)
    return {"ok": True, "kind": "hit", "hits": len(onsets), "slot": slot, "sample": "hit.wav",
            "centroid_hz": round(centroid), "decay_s": round(decay, 3),
            "length_s": round(len(seg) / sr, 3)}


# ---------------------------------------------------------------- hum -> notes
def yin_track(x, sr, fmin=70.0, fmax=1000.0, n=2048, hop=512):
    frames = frame(x, n, hop)
    frames = frames - frames.mean(axis=1, keepdims=True)
    w = n // 2
    tau_min = max(2, int(sr / fmax))
    tau_max = min(int(sr / fmin), n - w - 1)
    taus = np.arange(tau_max + 1)
    spec_x = np.fft.rfft(frames, 2 * n, axis=1)
    spec_a = np.fft.rfft(frames[:, :w], 2 * n, axis=1)
    corr = np.fft.irfft(spec_x * np.conj(spec_a), axis=1)[:, : tau_max + 1]
    csum = np.pad(np.cumsum(frames ** 2, axis=1), ((0, 0), (1, 0)))
    e0 = csum[:, w][:, None]
    et = csum[:, taus + w] - csum[:, taus]
    d = np.maximum(e0 + et - 2 * corr, 0.0)
    d[:, 0] = 0.0
    cum = np.cumsum(d[:, 1:], axis=1)
    cmnd = np.ones_like(d)
    cmnd[:, 1:] = d[:, 1:] * taus[1:] / np.maximum(cum, 1e-12)

    f0 = np.zeros(len(frames))
    conf = np.zeros(len(frames))
    for i in range(len(frames)):
        row = cmnd[i]
        cand = np.nonzero(row[tau_min:] < 0.2)[0]
        if len(cand):
            t = tau_min + int(cand[0])
            while t + 1 <= tau_max and row[t + 1] < row[t]:
                t += 1
        else:
            t = tau_min + int(np.argmin(row[tau_min:]))
        if 1 <= t < tau_max:  # parabolic interpolation
            a, b, c = row[t - 1], row[t], row[t + 1]
            den = a - 2 * b + c
            shift = 0.5 * (a - c) / den if abs(den) > 1e-12 else 0.0
        else:
            shift = 0.0
        f0[i] = sr / (t + shift)
        conf[i] = 1.0 - row[t]
    rms = np.sqrt((frames ** 2).mean(axis=1))
    times = (np.arange(len(frames)) * hop + n / 2) / sr
    return f0, conf, rms, times


def snap_to_scale(m, tonic, scale):
    sc = SCALES.get(scale, SCALES["minor"])
    pc = (m - tonic) % 12
    best = min(sc, key=lambda s: (min(abs(pc - s), 12 - abs(pc - s)), s))
    diff = best - pc
    if diff > 6:
        diff -= 12
    if diff < -6:
        diff += 12
    return int(m + diff)


def analyse_hum(x, sr, kind, bpm, tonic, scale, steps, pre_roll):
    step_s = 60.0 / bpm / 4.0
    f0, conf, rms, times = yin_track(x, sr)
    # relative to the loudest frame, so a take with little or no silence still counts as voiced
    gate = max(min(float(np.percentile(rms, 30)) * 2.5, 0.25 * float(rms.max())), 0.01)
    voiced = (conf > 0.75) & (rms > gate) & (f0 > 60) & (f0 < 1100)
    midi = np.where(voiced, 69 + 12 * np.log2(np.maximum(f0, 1e-6) / 440.0), np.nan)
    sm = midi.copy()  # median filter over voiced neighbours
    for i in range(len(midi)):
        if voiced[i]:
            win = midi[max(0, i - 2):i + 3]
            sm[i] = np.nanmedian(win)

    hop_s = times[1] - times[0] if len(times) > 1 else 0.01
    segments, cur, gap = [], [], 0
    for i in range(len(sm)):
        if voiced[i]:
            if cur and abs(sm[i] - np.median([sm[j] for j in cur[-6:]])) > 0.9:
                segments.append(cur)
                cur = []
            cur.append(i)
            gap = 0
        elif cur:
            gap += 1
            if gap > 2:
                segments.append(cur)
                cur, gap = [], 0
    if cur:
        segments.append(cur)

    max_rms = float(rms.max()) if len(rms) else 1.0
    raw_notes = []
    for seg in segments:
        t0 = times[seg[0]] - hop_s / 2 - pre_roll
        t1 = times[seg[-1]] + hop_s / 2 - pre_roll
        if t1 - t0 < 0.6 * step_s:
            continue
        m = float(np.median(sm[seg]))
        vel = 0.55 + 0.45 * float(np.mean(rms[seg])) / max(max_rms, 1e-9)
        raw_notes.append((t0, t1, m, vel))
    if not raw_notes:
        return {"ok": True, "kind": kind, "notes": [], "steps": steps,
                "voiced": round(float(voiced.mean()), 3),
                "message": "I couldn't hear a clear tune. Hum a little louder and hold each note."}

    # move the whole tune into the right register, then snap to the key and the 16th grid
    med = float(np.median([n[2] for n in raw_notes]))
    lo = 36 if kind == "bass" else 60
    octave_shift = 12 * int(np.round((lo + 6 - med) / 12.0))
    notes = []
    for t0, t1, m, vel in raw_notes:
        s0 = int(round(t0 / step_s))
        s1 = int(round(t1 / step_s))
        if s0 >= steps or s1 <= 0:
            continue
        s0 = max(0, s0)
        s1 = min(steps, max(s0 + 1, s1))
        notes.append({"start_step": s0, "dur_steps": s1 - s0,
                      "midi": snap_to_scale(int(round(m + octave_shift)), tonic, scale),
                      "velocity": round(min(1.0, vel), 3)})
    notes.sort(key=lambda n: n["start_step"])
    merged = []
    for nt in notes:
        if merged:
            prev = merged[-1]
            prev_end = prev["start_step"] + prev["dur_steps"]
            if nt["midi"] == prev["midi"] and nt["start_step"] <= prev_end:
                prev["dur_steps"] = max(prev_end, nt["start_step"] + nt["dur_steps"]) - prev["start_step"]
                continue
            if nt["start_step"] < prev_end:  # overlap after rounding: shorten the previous note
                prev["dur_steps"] = max(1, nt["start_step"] - prev["start_step"])
                if nt["start_step"] == prev["start_step"]:
                    merged.pop()
        merged.append(nt)
    return {"ok": True, "kind": kind, "notes": merged, "steps": steps,
            "voiced": round(float(voiced.mean()), 3), "octave_shift": octave_shift}


# ---------------------------------------------------------------- texture
def analyse_texture(x, sr, bpm, steps, pre_roll, out):
    loop_s = steps * 60.0 / bpm / 4.0
    n = int(round(loop_s * sr))
    s0 = int(round(pre_roll * sr))
    seg = np.zeros(n, dtype=np.float32)
    chunk = x[s0:s0 + n]
    seg[: len(chunk)] = chunk
    fade = min(int(0.03 * sr), n // 4)
    tail = x[s0 + n:s0 + n + fade]
    if fade and len(tail) == fade:  # blend what came after the loop end into its start: seamless wrap
        ramp = np.linspace(0, 1, fade)
        seg[:fade] = seg[:fade] * ramp + tail * (1 - ramp)
    if float(np.abs(seg).max()) < 0.003:
        return {"ok": True, "kind": "texture", "message": "That take was silent. Try again closer to the mic."}
    seg = normalize(seg, 0.8)
    write_wav(os.path.join(out, "loop.wav"), seg, sr)
    return {"ok": True, "kind": "texture", "loop": "loop.wav", "seconds": round(loop_s, 3)}


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav")
    ap.add_argument("--kind", required=True, choices=["hit", "melody", "bass", "texture"])
    ap.add_argument("--bpm", type=float, default=90.0)
    ap.add_argument("--tonic", type=int, default=57)
    ap.add_argument("--scale", default="minor")
    ap.add_argument("--steps", type=int, default=32)
    ap.add_argument("--pre-roll", type=float, default=0.0)
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    x, sr = read_wav(a.wav)
    if a.kind == "hit":
        res = analyse_hit(x, sr, a.out)
    elif a.kind in ("melody", "bass"):
        res = analyse_hum(x, sr, a.kind, a.bpm, a.tonic, a.scale, a.steps, a.pre_roll)
    else:
        res = analyse_texture(x, sr, a.bpm, a.steps, a.pre_roll, a.out)
    res["sample_rate"] = sr
    res["take_seconds"] = round(len(x) / sr, 3)
    return res


if __name__ == "__main__":
    try:
        result = main()
    except Exception as exc:  # report, don't crash: the backend reads this JSON
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    sys.stdout.write(json.dumps(result) + "\n")
    sys.stdout.flush()
