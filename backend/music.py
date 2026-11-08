"""ElevenLabs Music: composition-plan builder + generation."""
from __future__ import annotations

import logging
import os
import time

import requests

log = logging.getLogger("loopstack")
URL = "https://api.elevenlabs.io/v1/music"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def build_plan(vibe: dict, parts: list[dict], prev_song_id: str | None, new_words: list[str] | None) -> dict:
    """vibe + every part's words → v2 composition plan.

    prev_song_id: condition the first chunk on the previous version (None for v1 and vibe changes).
    new_words:    the part that was just added, so the main chunk can announce it.
    """
    total = _env_int("VERSION_MS", 20000)
    intro = min(8000, max(3000, total // 3))
    main = max(3000, total - intro)

    words = [w for p in parts for w in p.get("words", [])]
    positive = list(vibe["styles"]) + [f"{vibe['bpm']} BPM", "instrumental", "great production quality"] + words
    negative = list(dict.fromkeys(list(vibe.get("negative_styles", [])) + ["vocals", "singing", "spoken word"]))

    first = {
        "text": "[Intro]\n{the beat continues}" if prev_song_id else "[Intro]",
        "duration_ms": intro,
        "positive_styles": positive,
        "negative_styles": negative,
    }
    if prev_song_id:
        first["conditioning_ref"] = {"song_id": prev_song_id, "range": {"start_ms": 0, "end_ms": intro}}
        first["condition_strength"] = os.environ.get("CONDITION_STRENGTH", "high")
    main_text = "[Main]\n{" + (", ".join(new_words) + " enters" if new_words else "full groove") + "}"
    second = {"text": main_text, "duration_ms": main, "positive_styles": positive, "negative_styles": negative}
    return {"chunks": [first, second]}


def generate(plan: dict, seed: int) -> tuple[bytes, str | None, dict]:
    """Returns (mp3 bytes, song_id or None, response headers)."""
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set in .env")
    body = {
        "model_id": os.environ.get("MUSIC_MODEL", "music_v2"),
        "seed": seed,
        "store_for_inpainting": True,
        "composition_plan": plan,
    }
    t0 = time.time()
    r = requests.post(URL, params={"output_format": "mp3_44100_128"}, headers={"xi-api-key": key},
                      json=body, timeout=300)
    log.info("music: HTTP %s in %.1fs", r.status_code, time.time() - t0)
    if not r.ok:
        raise RuntimeError(f"ElevenLabs Music {r.status_code}: {r.text[:500]}")
    headers = dict(r.headers)
    header = os.environ.get("SONG_ID_HEADER")
    song_id = headers.get(header) if header else next(
        (v for h, v in headers.items() if "song" in h.lower() and "id" in h.lower()), None)
    if not song_id:
        log.warning("no song_id header found; next version can't be conditioned. headers: %s", list(headers))
    return r.content, song_id, headers
