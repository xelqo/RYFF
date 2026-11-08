"""Teammates' modules, with stand-ins until they land.

Interfaces the backend expects (tell Alex before changing them):

  backend/vibes.py (Avi)
    vibe_from_text(text: str) -> dict
        {"name": "lofi", "styles": [...], "bpm": 80, "negative_styles": [...],
         "instruments": {"drums": "...", "bass": "...", "melody": "...", "texture": "..."}}

  backend/words.py (Avi)
    traits_to_words(kind: str, traits: dict, vibe: dict) -> list[str]

  backend/daytona_runner.py (Derik)
    class DaytonaRunner:
        start(session_id: str) -> None                      # create or reuse ONE sandbox per session
        analyse(local_audio: str, kind: str) -> dict         # Traits JSON (or {"error": "..."} if too quiet)
        mix(local_mp3: str, hit_takes: list[str]) -> str     # path to the mixed mp3 (hits layered on beats,
                                                             #  -14 LUFS, fades). hit_takes = raw drum takes
        stop(session_id: str) -> None
    `local_audio` may be webm/ogg/mp4 from the browser's MediaRecorder; convert with ffmpeg in the sandbox.
"""
from __future__ import annotations

import logging

log = logging.getLogger("loopstack")

# ---------------------------------------------------------------- vibes (Avi)
try:
    from vibes import vibe_from_text  # type: ignore
    log.info("using backend/vibes.py")
except ImportError:
    _PRESETS = {
        "lofi": dict(styles=["chill lo-fi hip hop", "dusty vinyl", "mellow"], bpm=80,
                     instruments=dict(drums="lo-fi drums", bass="warm muted bass", melody="rhodes electric piano",
                                      texture="vinyl crackle ambience"),
                     keywords=["lofi", "lo-fi", "lo fi", "chill", "study", "relax"]),
        "trap": dict(styles=["dark trap", "808 bass", "moody"], bpm=140,
                     instruments=dict(drums="trap drums with rolling hi-hats", bass="distorted 808 bass",
                                      melody="dark bell synth", texture="eerie ambient pad"),
                     keywords=["trap", "dark", "drill", "hip hop", "rap"]),
        "house": dict(styles=["summer house", "four on the floor", "uplifting"], bpm=124,
                      instruments=dict(drums="house drums with claps", bass="bouncy synth bass",
                                       melody="bright piano chords and synth lead", texture="beach ambience"),
                      keywords=["house", "summer", "dance", "edm", "club", "beach"]),
        "pop": dict(styles=["upbeat pop", "catchy", "polished"], bpm=110,
                    instruments=dict(drums="punchy pop drums", bass="tight electric bass",
                                     melody="bright synth lead", texture="shimmering pad"),
                    keywords=["pop", "happy", "upbeat", "fun"]),
    }

    def vibe_from_text(text: str) -> dict:
        t = text.lower()
        name = next((n for n, p in _PRESETS.items() if any(k in t for k in p["keywords"])), "lofi")
        p = _PRESETS[name]
        styles = list(p["styles"])
        if name == "lofi" and not any(k in t for k in p["keywords"]):
            styles = [text.strip()] + styles[1:]          # unknown vibe: lead with the user's own words
        return {"name": name, "styles": styles, "bpm": p["bpm"], "negative_styles": [],
                "instruments": p["instruments"]}

# ---------------------------------------------------------------- words (Avi)
try:
    from words import traits_to_words  # type: ignore
    log.info("using backend/words.py")
except ImportError:
    def traits_to_words(kind: str, traits: dict, vibe: dict) -> list[str]:
        inst = vibe.get("instruments", {}).get(kind, kind)
        busy, punch, bright = (traits.get(k, 0.5) for k in ("busyness", "punch", "brightness"))
        if kind == "drums":
            feel = "driving, busy" if busy > 0.6 else "laid-back, sparse" if busy < 0.35 else "steady"
            hit = "punchy" if punch > 0.6 else "soft" if punch < 0.35 else "crisp"
            return [f"{feel} {inst}", f"{hit} percussion"]
        if kind in ("bass", "melody"):
            reg = traits.get("pitch_register", "low" if kind == "bass" else "mid")
            contour = traits.get("contour", "flat")
            shape = {"rising": "soaring, rising", "falling": "falling, melancholic", "arch": "arching, lyrical"}.get(contour, "steady")
            smooth = "smooth, legato" if traits.get("smoothness", 0.5) > 0.5 else "plucky, staccato"
            return [f"{shape} {smooth} {inst}" + (" in a low register" if reg == "low" else " in a high register" if reg == "high" else "")]
        tone = "shimmering bright" if bright > 0.6 else "warm, dusty" if bright < 0.35 else "subtle"
        return [f"{tone} {inst}"]

# ---------------------------------------------------------------- Daytona (Derik)
try:
    from analysis import AnalysisRunner  # Derik's runners.py + sandbox/analyse.py, adapted to traits
    runner = AnalysisRunner()
    log.info("using Daytona analysis (runners.py)")
except ImportError as e:
    log.warning("runners.py unavailable (%s)", e)
    import random
    import shutil

    class _StubRunner:
        """Fake traits, no mixing. Replaced by Derik's DaytonaRunner."""

        def start(self, session_id: str) -> None:
            pass

        def analyse(self, local_audio: str, kind: str) -> dict:
            r = random.Random(local_audio)
            t = {"busyness": round(r.random(), 2), "punch": round(r.random(), 2),
                 "brightness": round(r.random(), 2), "length_s": 5.0, "stub": True}
            if kind in ("bass", "melody"):
                t |= {"pitch_register": "low" if kind == "bass" else r.choice(["mid", "high"]),
                      "contour": r.choice(["rising", "falling", "arch", "flat"]),
                      "smoothness": round(r.random(), 2)}
            return t

        def mix(self, local_mp3: str, hit_takes: list[str]) -> str:
            out = local_mp3.replace(".raw.mp3", ".mp3")
            shutil.copyfile(local_mp3, out)
            return out

        def stop(self, session_id: str) -> None:
            pass

    runner = _StubRunner()
    log.warning("daytona_runner.py not found: using stub traits and no mixing")
