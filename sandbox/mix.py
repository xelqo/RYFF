"""Layer the user's real hit samples onto the beat of a generated song. numpy only (runs in the Daytona sandbox).

    python3 mix.py song.wav out.wav --hit hit0.wav:snare --hit hit1.wav:kick [--bpm 80]

Finds the tempo (or uses --bpm) and the beat phase from the song's low-end onsets (the kick), then places:
  kick  → every beat          snare/perc → beats 2 and 4          hat → off-beats (the "and")
Prints one JSON line: {"ok": true, "bpm": ..., "placed": N, ...}
"""
from __future__ import annotations

import argparse
import json
import sys
import wave

import numpy as np


def read_wav(path):
    with wave.open(path, "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"{path}: expected 16-bit wav")
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    return x.reshape(-1, ch), sr


def write_wav(path, x, sr):
    y = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(y.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(y.tobytes())


def onset_env(mono, sr, hop=512, n=2048, fmax=None):
    frames = np.lib.stride_tricks.sliding_window_view(mono, n)[::hop] * np.hanning(n)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    if fmax:
        spec = spec[:, np.fft.rfftfreq(n, 1 / sr) < fmax]
    flux = np.maximum(np.diff(np.log1p(spec), axis=0), 0).sum(axis=1)
    flux = np.concatenate([[0], flux])
    return flux / (flux.max() + 1e-9), hop / sr


def tempo_and_phase(mono, sr, bpm=None):
    low, dt = onset_env(mono, sr, fmax=200)          # kick drum
    full, _ = onset_env(mono, sr)
    env = 0.7 * low + 0.3 * full
    # Tempo from autocorrelation, weighted towards the requested tempo (or ~110 BPM if none): the raw peak is
    # often a 3:2 or 2:1 relative (an 80 BPM lo-fi track peaks at 120 and 60).
    e = env - env.mean()
    ac = np.correlate(e, e, "full")[len(e) - 1:]
    lags = np.arange(1, len(ac))
    bpms = 60 / (lags * dt)
    ok = (bpms >= 60) & (bpms <= 180)
    centre, width = (bpm, 0.06) if bpm else (110.0, 0.5)
    weight = np.exp(-0.5 * (np.log2(bpms[ok] / centre) / width) ** 2)
    bpm = float(bpms[ok][np.argmax(np.maximum(ac[1:][ok], 0) * weight)])
    period = 60.0 / bpm / dt
    # beat phase: offset whose beat grid collects the most kick energy
    best, best_score = 0.0, -1.0
    for off in np.arange(0, period, 0.25):
        idx = np.round(np.arange(off, len(low), period)).astype(int)
        idx = idx[idx < len(low)]
        score = low[idx].sum()
        if score > best_score:
            best, best_score = off, score
    return bpm, best * dt, 60.0 / bpm      # bpm, first beat time (s), beat length (s)


def place_times(slot, first, beat, duration):
    if slot == "kick":
        start, step = first, beat
    elif slot == "hat":
        start, step = first + beat / 2, beat
    else:                                   # snare, perc, clap: backbeat (2 and 4)
        start, step = first + beat, 2 * beat
    return [t for t in np.arange(start, duration - 0.05, step) if t >= 0.25]


_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
SCALES = {"major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10]}
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def best_key(hist):
    """Krumhansl-Kessler: (tonic pitch class, "major"/"minor") for a 12-bin pitch-class histogram."""
    h = np.asarray(hist, float)
    best = (-2.0, 0, "minor")
    for scale, prof in (("major", _MAJOR), ("minor", _MINOR)):
        for k in range(12):
            r = np.corrcoef(h, np.roll(prof, k))[0, 1]
            if np.isfinite(r) and r > best[0]:
                best = (float(r), k, scale)
    return best[1], best[2]


def song_key(mono, sr):
    n, hop = 4096, 2048
    frames = np.lib.stride_tricks.sliding_window_view(mono, n)[::hop] * np.hanning(n)
    spec = np.abs(np.fft.rfft(frames, axis=1)).mean(axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)
    m = (f > 60) & (f < 2000)
    pc = np.round(12 * np.log2(f[m] / 440.0) + 69).astype(int) % 12
    return best_key([spec[m][pc == i].sum() for i in range(12)])


def fit_melody(notes, tonic, scale):
    """Move the hummed notes into the song's key: transpose tonic→tonic, then snap to the scale."""
    hist = [0.0] * 12
    for nt in notes:
        hist[nt["midi"] % 12] += nt["dur_steps"]
    m_tonic, m_scale = best_key(hist)
    target = tonic if m_scale == scale else (tonic + (9 if m_scale == "minor" else 3)) % 12   # relative key
    shift = (target - m_tonic) % 12
    shift = shift - 12 if shift > 6 else shift
    sc = SCALES[scale]
    out = []
    for nt in notes:
        m = nt["midi"] + shift
        pc = (m - tonic) % 12
        snap = min(sc, key=lambda s: min(abs(pc - s), 12 - abs(pc - s)))
        d = snap - pc
        d = d - 12 if d > 6 else d + 12 if d < -6 else d
        out.append({**nt, "midi": int(m + d)})
    return out, shift


def synth_note(midi, dur, sr, vel=0.8):
    """Soft electric-piano-ish tone: a few decaying harmonics, short attack, gentle release."""
    f = 440.0 * 2 ** ((midi - 69) / 12)
    n = int((dur + 0.25) * sr)
    t = np.arange(n) / sr
    tone = (np.sin(2 * np.pi * f * t) + 0.35 * np.exp(-t / 0.4) * np.sin(2 * np.pi * 2 * f * t)
            + 0.12 * np.exp(-t / 0.2) * np.sin(2 * np.pi * 3 * f * t))
    env = np.minimum(1.0, t / 0.01) * (0.55 + 0.45 * np.exp(-t / 0.25))
    rel = t > dur
    env[rel] *= np.exp(-(t[rel] - dur) / 0.08)
    tremolo = 1 + 0.08 * np.sin(2 * np.pi * 4.5 * t)
    return (tone * env * tremolo * vel).astype(np.float32)


def clean_melody(notes, tonic, scale, phrase_steps):
    """Make a sloppy hum sound intentional: 8th-note timing, no blips, legato, no wild leaps, comfortable
    register, phrase ends on a chord tone of the home chord. Steps are 16ths on the song grid."""
    sc = SCALES[scale]
    ns = []
    for nt in sorted(notes, key=lambda n: n["start_step"]):
        s = int(np.floor(nt["start_step"] / 2.0 + 0.5)) * 2               # starts on 8th notes
        if ns and nt["midi"] == ns[-1]["midi"] and s <= ns[-1]["start_step"] + ns[-1]["dur_steps"] + 1:
            continue                                                      # repeated note = one longer note
        if ns and s <= ns[-1]["start_step"]:                              # same slot as the previous note: next 8th
            s = ns[-1]["start_step"] + 2
        if s >= phrase_steps:
            continue
        ns.append({"start_step": s, "dur_steps": max(2, int(round(nt["dur_steps"] / 2.0)) * 2),
                   "midi": nt["midi"], "velocity": nt.get("velocity", 0.8)})
    if not ns:
        return ns
    for i, nt in enumerate(ns):                                           # legato: hold to the next note
        nxt = ns[i + 1]["start_step"] if i + 1 < len(ns) else phrase_steps
        nt["dur_steps"] = max(2, min(nxt - nt["start_step"], 8))
        if i:                                                             # fold leaps bigger than a 5th
            while nt["midi"] - ns[i - 1]["midi"] > 7:
                nt["midi"] -= 12
            while ns[i - 1]["midi"] - nt["midi"] > 7:
                nt["midi"] += 12
    centre = sorted(n["midi"] for n in ns)[len(ns) // 2]                  # keep it around C4–G5
    shift = 12 * int(round((67 - centre) / 12.0))
    for nt in ns:
        nt["midi"] += shift
    last = ns[-1]                                                         # resolve: end on 1, 3 or 5 of the key
    home = [(tonic + sc[d]) % 12 for d in (0, 2, 4)]
    best = min((last["midi"] + d for d in range(-4, 5) if (last["midi"] + d) % 12 in home), key=lambda m: abs(m - last["midi"]))
    last["midi"] = best
    last["dur_steps"] = max(last["dur_steps"], 4)
    return ns


def bass_from_melody(notes, tonic, scale, phrase_steps):
    """One chord per bar (I, IV, V, vi or i, iv, v, VI) chosen to fit the hummed notes; bass plays the root low on
    beats 1 and 3, with a short pickup into the next bar."""
    sc = SCALES[scale]
    degrees = [0, 3, 4, 5]                                                # scale degrees of the chord roots
    bass = []
    for bar in range(phrase_steps // 16):
        weight = [0.0] * 12
        for nt in notes:
            a, b = max(nt["start_step"], bar * 16), min(nt["start_step"] + nt["dur_steps"], bar * 16 + 16)
            if b > a:
                weight[nt["midi"] % 12] += b - a
        def score(d):
            tones = [(tonic + sc[(d + k) % 7]) % 12 for k in (0, 2, 4)]
            return sum(weight[p] for p in tones) + (0.5 if d == 0 else 0)  # small preference for the home chord
        d = max(degrees, key=score) if bar else 0                         # first bar: home chord
        root = 36 + (tonic + sc[d]) % 12                                  # C2..B2
        s0 = bar * 16
        bass += [{"start_step": s0, "dur_steps": 7, "midi": root, "velocity": 0.9},
                 {"start_step": s0 + 8, "dur_steps": 5, "midi": root, "velocity": 0.75},
                 {"start_step": s0 + 14, "dur_steps": 2, "midi": root + 12 if (bar % 2) else root + 7, "velocity": 0.6}]
    return bass


def synth_bass(midi, dur, sr, vel=0.9):
    f = 440.0 * 2 ** ((midi - 69) / 12)
    n = int((dur + 0.12) * sr)
    t = np.arange(n) / sr
    tone = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    env = np.minimum(1.0, t / 0.006) * (0.75 + 0.25 * np.exp(-t / 0.15))
    rel = t > dur
    env[rel] *= np.exp(-(t[rel] - dur) / 0.04)
    return (tone * env * vel).astype(np.float32)


def render_melody(spec, out, sr, first, beat, key, mono):
    """Loop the hummed phrase over the song, on the song's beat grid, in the song's key."""
    notes, note_bpm = spec["notes"], float(spec.get("bpm") or 100)
    if not notes:
        return 0, None
    tonic, scale = key if key else song_key(mono, sr)
    notes, shift = fit_melody(notes, tonic, scale)
    src_step = 60.0 / note_bpm / 4                       # seconds per 16th in the take
    step = beat / 4                                       # seconds per 16th in the song
    grid = [{**n, "start_step": int(round(n["start_step"] * src_step / step)),
             "dur_steps": max(1, int(round(n["dur_steps"] * src_step / step)))} for n in notes]
    end_steps = max(n["start_step"] + n["dur_steps"] for n in grid)
    phrase_steps = min(64, max(16, int(np.ceil(end_steps / 16.0)) * 16))   # 1–4 bars
    grid = clean_melody(grid, tonic, scale, phrase_steps)
    bass = bass_from_melody(grid, tonic, scale, phrase_steps) if spec.get("bass", True) else []
    layer = np.zeros(len(out), np.float32)
    bass_layer = np.zeros(len(out), np.float32)
    start = first
    while start < len(out) / sr - 0.2:
        for target, seq, synth in ((layer, grid, synth_note), (bass_layer, bass, synth_bass)):
            for nt in seq:
                t0 = start + nt["start_step"] * step
                tone = synth(nt["midi"], nt["dur_steps"] * step, sr, nt.get("velocity", 0.8))
                i = int(t0 * sr)
                j = min(len(target), i + len(tone))
                if i < len(target):
                    target[i:j] += tone[: j - i]
        start += phrase_steps * step
    peak = float(np.abs(layer).max()) or 1.0
    if np.abs(bass_layer).max() > 0:                     # bass sits a little under the melody
        layer = layer + bass_layer * (0.8 * peak / float(np.abs(bass_layer).max()))
    return layer, f"{NAMES[tonic]} {scale}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("song")
    ap.add_argument("out")
    ap.add_argument("--hit", action="append", default=[], help="path:slot")
    ap.add_argument("--bpm", type=float, default=0)
    ap.add_argument("--level", type=float, default=0.55, help="hit peak relative to the song's peak")
    ap.add_argument("--melody", action="append", default=[], help="json file: {notes: [...], bpm: N}")
    ap.add_argument("--key", default="", help='song key, e.g. "D minor" (else estimated from the song)')
    ap.add_argument("--melody-level", type=float, default=0.5)
    a = ap.parse_args()

    song, sr = read_wav(a.song)
    mono = song.mean(axis=1)
    bpm, first, beat = tempo_and_phase(mono, sr, a.bpm or None)
    out = song.copy()
    song_peak = float(np.abs(song).max()) or 1.0
    placed = 0
    for spec in a.hit:
        path, _, slot = spec.partition(":")
        hit, hsr = read_wav(path)
        if hsr != sr:                       # simple resample to the song's rate
            t = np.linspace(0, len(hit) - 1, int(len(hit) * sr / hsr))
            hit = np.stack([np.interp(t, np.arange(len(hit)), hit[:, c]) for c in range(hit.shape[1])], axis=1)
        hit = hit.mean(axis=1, keepdims=True).repeat(out.shape[1], axis=1)
        hit *= a.level * song_peak / (float(np.abs(hit).max()) or 1.0)
        fade = min(len(hit), int(0.01 * sr))
        if fade:
            hit[-fade:] *= np.linspace(1, 0, fade)[:, None]
        for t in place_times(slot or "snare", first, beat, len(out) / sr):
            i = int(t * sr)
            j = min(len(out), i + len(hit))
            out[i:j] += hit[: j - i]
            placed += 1
    key = None
    if a.key:
        name, _, scale = a.key.partition(" ")
        if name in NAMES and scale in SCALES:
            key = (NAMES.index(name), scale)
    melody_keys = []
    for path in a.melody:
        with open(path) as f:
            spec = json.load(f)
        layer, used_key = render_melody(spec, out, sr, first, beat, key, mono)
        if isinstance(layer, np.ndarray) and np.abs(layer).max() > 0:
            layer *= a.melody_level * song_peak / float(np.abs(layer).max())
            out += layer[:, None]
            melody_keys.append(used_key)
    peak = float(np.abs(out).max())
    if peak > 0.98:                         # keep it from clipping
        out *= 0.98 / peak
    write_wav(a.out, out, sr)
    return {"ok": True, "bpm": round(bpm, 1), "first_beat_s": round(first, 3), "placed": placed,
            "melodies": len(melody_keys), "melody_key": melody_keys[0] if melody_keys else None}


if __name__ == "__main__":
    try:
        result = main()
    except Exception as exc:
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    sys.stdout.write(json.dumps(result) + "\n")
