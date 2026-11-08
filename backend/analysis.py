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
MIX_SCRIPT = Path(__file__).resolve().parent.parent / "sandbox" / "mix.py"
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


NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]   # Krumhansl-Kessler profiles
_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def key_from_notes(notes: list[dict]) -> dict | None:
    """Estimate the key of a hum from its (unsnapped) notes, weighting each pitch class by duration."""
    if len(notes) < 2:
        return None
    hist = [0.0] * 12
    for n in notes:
        hist[n["midi"] % 12] += n["dur_steps"]
    mean_h = sum(hist) / 12

    def corr(profile, tonic):
        prof = profile[-tonic:] + profile[:-tonic]
        mp = sum(prof) / 12
        num = sum((h - mean_h) * (q - mp) for h, q in zip(hist, prof))
        den = (sum((h - mean_h) ** 2 for h in hist) * sum((q - mp) ** 2 for q in prof)) ** 0.5
        return num / den if den else 0.0

    score, tonic, scale = max((corr(prof, k), k, s) for k in range(12) for s, prof in (("major", _MAJOR), ("minor", _MINOR)))
    return {"key": f"{NOTE_NAMES[tonic]} {scale}", "tonic": 48 + tonic, "scale": scale,
            "confidence": round(score, 2), "notes": len(notes)}


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
            extra = ["--scale", "chromatic", "--steps", "64"] if kind in ("bass", "melody") else []
            result, files = runners.get_runner().run(wav.read_bytes(), ["--kind", KIND_ARG[kind], "--bpm", str(bpm), *extra])
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
            if kind in ("bass", "melody") and result.get("notes"):
                traits["_notes"] = {"notes": result["notes"], "bpm": bpm}    # rendered into the mix as-is
        traits["runner"] = result.get("runner")
        for name, blob in files.items():           # e.g. hit.wav → part_<id>.hit.wav next to the take
            out = Path(local_audio).with_suffix(f".{name}")
            out.write_bytes(blob)
            if name == "hit.wav":
                traits["_hit_path"] = str(out)
        return traits

    def detect_key(self, local_audio: str) -> dict:
        self.start("")
        wav = to_wav(Path(local_audio))
        try:
            result, _ = runners.get_runner().run(wav.read_bytes(), ["--kind", "melody", "--scale", "chromatic", "--steps", "64"])
        except runners.AnalysisError as e:
            return {"error": str(e)}
        key = key_from_notes(result.get("notes") or []) if result.get("ok") else None
        if not key:
            return {"error": result.get("message") or "Couldn't hear a tune. Hum a few longer notes and try again."}
        key["runner"] = result.get("runner")
        return key

    def mix(self, local_mp3: str, hits: list, bpm: int | None = None, melodies: list | None = None,
            key: str | None = None, out: str | None = None) -> str:
        """Layer the user's real hits and hummed melodies onto the song's beat (sandbox/mix.py, run in Daytona),
        then -14 LUFS. hits: [(hit_wav_path, slot)]; melodies: [{"notes": [...], "bpm": N}].
        Any failure falls back to the unmixed song so a version is never lost."""
        import json
        melodies = melodies or []
        out = out or local_mp3.replace(".raw.mp3", ".mp3")
        ff = _ffmpeg()
        if not (hits or melodies) or not ff:
            shutil.copyfile(local_mp3, out)
            return out
        song_wav = out.replace(".mp3", ".song.wav")
        mixed_wav = out.replace(".mp3", ".mixed.wav")
        mel_files = []
        try:
            subprocess.run([ff, "-v", "error", "-y", "-i", local_mp3, "-ac", "2", "-ar", "44100", "-sample_fmt", "s16",
                            song_wav], check=True, timeout=60)
            names = [f"hit{i}.wav" for i in range(len(hits))]
            args = ["--bpm", str(bpm or 0)] + [a for n, (_, slot) in zip(names, hits) for a in ("--hit", f"{n}:{slot or 'snare'}")]
            files = [h for h, _ in hits]
            for i, mel in enumerate(melodies):
                path = out.replace(".mp3", f".mel{i}.json")
                Path(path).write_text(json.dumps(mel))
                mel_files.append(path)
                files.append(path)
                names.append(f"mel{i}.json")
                args += ["--melody", f"mel{i}.json"]
            if key:
                args += ["--key", key]
            result = self._run_mix(song_wav, files, names, args, mixed_wav)
            if not result.get("ok"):
                raise RuntimeError(result.get("error"))
            log.info("mixed %d hits + %d melodies (%s) at %s BPM via %s", result.get("placed", 0),
                     result.get("melodies", 0), result.get("melody_key"), result.get("bpm"), result.get("runner"))
            subprocess.run([ff, "-v", "error", "-y", "-i", mixed_wav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
                            "-ar", "44100", "-b:a", "192k", out], check=True, timeout=120)
        except Exception as e:
            log.warning("mix failed (%s); using the unmixed song", e)
            shutil.copyfile(local_mp3, out)
        finally:
            for f in (song_wav, mixed_wav, *mel_files):
                Path(f).unlink(missing_ok=True)
        return out

    def _run_mix(self, song_wav: str, hit_paths: list[str], names: list[str], args: list[str], out_wav: str) -> dict:
        import json, shlex, sys, tempfile, uuid
        runner = runners.get_runner()
        if runner is runners.DAYTONA:
            d = runners.DAYTONA
            job = f"{runners.REMOTE}/mix/{uuid.uuid4().hex[:8]}"
            with d._lock:
                d._exec(f"mkdir -p {job}")
                d.sandbox.fs.upload_file(MIX_SCRIPT.read_bytes(), f"{job}/mix.py")
                d.sandbox.fs.upload_file(Path(song_wav).read_bytes(), f"{job}/song.wav")
                for path, name in zip(hit_paths, names):
                    d.sandbox.fs.upload_file(Path(path).read_bytes(), f"{job}/{name}")
                cmd = f"cd {job} && python3 mix.py song.wav out.wav " + " ".join(shlex.quote(a) for a in args)
                r = d._exec(cmd)
                result = runners._parse(getattr(r, "result", "") or "")
                if result.get("ok"):
                    Path(out_wav).write_bytes(d.sandbox.fs.download_file(f"{job}/out.wav"))
                d._exec(f"rm -rf {job}")
            result["runner"] = "daytona"
            return result
        with tempfile.TemporaryDirectory() as tmp:            # local fallback (dev only)
            shutil.copyfile(song_wav, f"{tmp}/song.wav")
            for path, name in zip(hit_paths, names):
                shutil.copyfile(path, f"{tmp}/{name}")
            p = subprocess.run([sys.executable, "-I", str(MIX_SCRIPT), "song.wav", "out.wav", *args],
                               cwd=tmp, capture_output=True, text=True, timeout=120)
            result = runners._parse(p.stdout or p.stderr)
            if result.get("ok"):
                shutil.copyfile(f"{tmp}/out.wav", out_wav)
        result["runner"] = "local"
        return result

    def stop(self, session_id: str) -> None:
        pass
