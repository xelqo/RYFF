"""ElevenLabs Sound Effects + Music, cached on disk by request so nothing is generated twice."""
import hashlib
import json
import os
import time
from pathlib import Path

import httpx

API = "https://api.elevenlabs.io"


class ElevenLabsError(RuntimeError):
    pass


def _headers() -> dict:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise ElevenLabsError("ELEVENLABS_API_KEY is not set in .env")
    return {"xi-api-key": key, "Content-Type": "application/json"}


def _post(path: str, payload: dict, timeout: float) -> bytes:
    for attempt in range(3):
        try:
            r = httpx.post(f"{API}{path}", headers=_headers(), json=payload, timeout=timeout)
        except httpx.HTTPError as e:
            raise ElevenLabsError(f"ElevenLabs {path} request failed: {type(e).__name__}: {e}") from e
        if r.status_code == 429 and attempt < 2:  # concurrency limit: back off and retry
            time.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code >= 400:
            raise ElevenLabsError(f"ElevenLabs {path} returned {r.status_code}: {r.text[:300]}")
        return r.content
    raise ElevenLabsError(f"ElevenLabs {path} kept returning 429 (too many requests)")


def _cached(cache_dir: Path, tag: str, payload: dict, fetch) -> Path:
    h = hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]
    path = cache_dir / f"{tag}-{h}.mp3"
    if path.exists() and path.stat().st_size > 0:
        return path
    data = fetch()
    tmp = path.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(path)
    return path


def sound_effect(cache_dir: Path, text: str, duration: float, influence: float = 0.7) -> Path:
    payload = {"text": text, "duration_seconds": round(max(0.5, min(30.0, duration)), 2),
               "prompt_influence": influence}
    return _cached(cache_dir, "sfx", payload, lambda: _post("/v1/sound-generation", payload, 120))


def compose_music(cache_dir: Path, prompt: str, length_ms: int) -> Path:
    payload = {"prompt": prompt, "music_length_ms": int(length_ms), "force_instrumental": True}
    return _cached(cache_dir, "music", payload, lambda: _post("/v1/music", payload, 300))
