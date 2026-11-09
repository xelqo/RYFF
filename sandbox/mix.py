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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("song")
    ap.add_argument("out")
    ap.add_argument("--hit", action="append", default=[], help="path:slot")
    ap.add_argument("--bpm", type=float, default=0)
    ap.add_argument("--level", type=float, default=0.55, help="hit peak relative to the song's peak")
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
    peak = float(np.abs(out).max())
    if peak > 0.98:                         # keep it from clipping
        out *= 0.98 / peak
    write_wav(a.out, out, sr)
    return {"ok": True, "bpm": round(bpm, 1), "first_beat_s": round(first, 3), "placed": placed}


if __name__ == "__main__":
    try:
        result = main()
    except Exception as exc:
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    sys.stdout.write(json.dumps(result) + "\n")
