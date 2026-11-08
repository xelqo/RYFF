"""Adapter: Derik's Daytona runner (runners.py + sandbox/analyse.py) → the Traits the song builder needs.

analyse.py reports concrete measurements (hit count, centroid, decay, hummed notes…); this turns them into the
rough 0–1 traits in docs/ARCHITECTURE.md and keeps the cut-out hit sample so it can be mixed into each version.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

import runners

log = logging.getLogger("loopstack")
KIND_ARG = {"drums": "hit", "bass": "bass", "melody": "melody", "texture": "texture"}


def _ffmpeg() -> str | None:
    return shutil.which("ffmpeg") or next(
        (p for p in [os.path.expanduser("~/.local/bin/ffmpeg"), "/opt/homebrew/bin/ffmpeg"] if os.path.exists(p)), None)


def to_wav(path: Path) -> Path:
    """analyse.py reads PCM WAV only; MediaRecorder gives webm/ogg/mp4."""
    with open(path, "rb") as f:
        head = f.read(12)
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return path
    ff = _ffmpeg()
    if not ff:
        raise RuntimeError("ffmpeg not found; send WAV from the browser or install ffmpeg")
    out = path.with_name(path.stem + ".conv.wav")   # never overwrite the input (it may be named .wav)
    # -t 15: uploaded files can be whole songs; the first 15 s is plenty to read the feel
    subprocess.run([ff, "-v", "error", "-y", "-i", str(path), "-t", "15", "-ac", "1", "-ar", "44100", "-sample_fmt", "s16", str(out)],
                   check=True, timeout=60)
    return out


def _clip(x: float) -> float:
    return round(max(0.0, min(1.0, x)), 2)


def to_traits(kind: str, r: dict) -> dict:
    take_s = float(r.get("take_seconds") or 1.0)
    if kind == "drums":
        hits_per_s = r.get("hits", 0) / max(take_s, 0.5)
        return {"busyness": _clip(hits_per_s / 4.0),                      # 4+ hits/s = very busy
                "punch": _clip(1.0 - float(r.get("decay_s", 0.2)) / 0.4),  # short decay = punchy
                "brightness": _clip(float(r.get("centroid_hz", 2000)) / 6000.0),
                "slot": r.get("slot"), "length_s": take_s}
    if kind in ("bass", "melody"):
        notes = r.get("notes") or []
        steps = int(r.get("steps") or 32)
        midis = [n["midi"] for n in notes]
        sung = (sum(midis) / len(midis) - int(r.get("octave_shift", 0))) if midis else 60
        register = "low" if sung < 55 else "high" if sung > 67 else "mid"
        contour = "flat"
        if len(midis) >= 3:
            third = max(1, len(midis) // 3)
            a, m, b = (sum(x) / len(x) for x in (midis[:third], midis[third:-third] or midis, midis[-third:]))
            if b - a >= 2:
                contour = "rising"
            elif a - b >= 2:
                contour = "falling"
            elif m - max(a, b) >= 2:
                contour = "arch"
        avg_len = sum(n["dur_steps"] for n in notes) / len(notes) if notes else 2
        return {"busyness": _clip(len(notes) / (steps / 2)),             # a note every 2 steps = very busy
                "punch": _clip(sum(n["velocity"] for n in notes) / len(notes)) if notes else 0.5,
                "brightness": _clip((sung - 40) / 40),
                "pitch_register": register, "contour": contour,
                "smoothness": _clip(avg_len / 4.0),                       # quarter-note-long notes = smooth
                "length_s": take_s}
    return {"busyness": 0.5, "punch": 0.5, "brightness": 0.5, "length_s": take_s}


class AnalysisRunner:
    """Implements the runner interface in contrib.py on top of runners.py."""

    def __init__(self):
        self._started = False

    def start(self, session_id: str) -> None:
        if not self._started:              # runners.py keeps ONE warm sandbox for the whole server
            self._started = True
            runners.start_runners()

    def status(self) -> dict:
        return runners.runner_status()

    def analyse(self, local_audio: str, kind: str, bpm: int = 90) -> dict:
        self.start("")
        wav = to_wav(Path(local_audio))
        try:
            result, files = runners.get_runner().run(wav.read_bytes(), ["--kind", KIND_ARG[kind], "--bpm", str(bpm)])
        except runners.AnalysisError as e:
            return {"error": str(e)}
        if not result.get("ok"):
            return {"error": result.get("error", "analysis failed")}
        if kind in ("bass", "melody", "texture") and not result.get("notes"):
            # Not a clear hum (e.g. an uploaded loop, a whistle, a noise): read its feel as a sound instead,
            # so ANY sound can become a backing part.
            try:
                result, files = runners.get_runner().run(wav.read_bytes(), ["--kind", "hit", "--bpm", str(bpm)])
            except runners.AnalysisError as e:
                return {"error": str(e)}
            files = {}
            if not result.get("ok") or not result.get("hits"):
                return {"error": "too quiet, ask again"}
            traits = to_traits("drums", result)
            traits.pop("slot", None)
            traits.update({"pitch_register": "mid", "contour": "flat", "smoothness": round(1 - traits["busyness"], 2)})
        elif kind == "drums" and not result.get("hits"):
            return {"error": result.get("message") or "too quiet, ask again"}
        else:
            traits = to_traits(kind, result)
        traits["runner"] = result.get("runner")
        for name, blob in files.items():           # e.g. hit.wav → part_<id>.hit.wav next to the take
            out = Path(local_audio).with_suffix(f".{name}")
            out.write_bytes(blob)
            if name == "hit.wav":
                traits["_hit_path"] = str(out)
        return traits

    def mix(self, local_mp3: str, hits: list[str]) -> str:
        # TODO(Derik): sandbox/mix.py: layer the hit samples on detected beats, -14 LUFS, fades, in the sandbox.
        out = local_mp3.replace(".raw.mp3", ".mp3")
        shutil.copyfile(local_mp3, out)
        return out

    def stop(self, session_id: str) -> None:
        pass
