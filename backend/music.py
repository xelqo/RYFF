"""ElevenLabs Music: composition-plan builder + generation."""
from __future__ import annotations

import logging
import os
import time

import requests

log = logging.getLogger("loopstack")
URL = "https://api.elevenlabs.io/v1/music"
DEFAULT_MS = 40000  # default version length (was 20 s); override with VERSION_MS or per session


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def build_plan(vibe: dict, parts: list[dict], prev_song_id: str | None, new_words: list[str] | None,
               total_ms: int | None = None) -> dict:
    """vibe + every part's words → v2 composition plan.

    prev_song_id: condition the first chunk on the previous version (None for v1 and vibe changes).
    new_words:    the part that was just added, so the main chunk can announce it.
    """
    # CONDITION_MODE (step 0 results, see docs/APIS.md):
    #   short: only a 3 s intro is conditioned on the previous version, main chunk has low context adherence.
    #          Intro keeps the old beat, then the new part clearly "drops in". (default)
    #   none:  no conditioning, same seed → new part audible, song stays loosely similar.
    #   full:  8 s conditioned intro, high adherence → keeps the beat but new parts are barely audible.
    mode = os.environ.get("CONDITION_MODE", "short")
    if mode == "none":
        prev_song_id = None
    # length of the whole version; ElevenLabs caps one chunk at 120 s, so keep the total within that
    total = max(10000, min(120000, int(total_ms) if total_ms else _env_int("VERSION_MS", DEFAULT_MS)))
    if prev_song_id and mode == "short":
        intro = _env_int("COND_INTRO_MS", 3000)
    else:
        intro = min(8000, max(3000, total // 3))
    main = max(3000, total - intro)

    words = [w for p in parts for w in p.get("words", [])]
    # The user's own words lead: the preset (nearest of 4 genres) only adds tempo/instruments/support styles.
    own = (vibe.get("text") or "").strip()
    styles = ([own] if own else []) + [s for s in vibe["styles"] if s.lower() != own.lower()]
    if own and vibe.get("name") and vibe["name"] not in own.lower().replace("-", "").replace(" ", ""):
        styles = styles[:1] + styles[2:]      # drop the preset's genre label when the user asked for something else

    # Layers the user hasn't added yet are kept OUT of the song, so every added sound brings in something new:
    # v1 = chords + atmosphere only; drums bring the kick/beat; a backing track brings bass + melody.
    kinds = {p.get("kind") for p in parts}
    has_drums = "drums" in kinds
    has_backing = bool(kinds & {"melody", "bass", "texture"})
    layer_words = ("drum", "beat", "groove", "swing", "kick", "snare", "hat", "808", "four-on-the-floor", "bass")
    if not has_drums:
        styles = styles[:1] + [s for s in styles[1:] if not any(w in s.lower() for w in layer_words)]
    melody_words = ("melod", "hook", "lead", "riff", "solo", "arpegg", "bell", "piano")
    if not has_backing:   # preset styles like "catchy instrumental hooks" invite a melody the user didn't add
        styles = styles[:1] + [s for s in styles[1:] if not any(w in s.lower() for w in melody_words)]
    pad = vibe.get("instruments", {}).get("texture") or "warm chord pad"
    lead_layers, layers, missing = [], [f"soft chords on {pad}"], []
    if has_drums:
        lead_layers.append("steady drum beat with kick")      # first in the list: later parts must not wash it out
    else:
        missing += ["drums", "percussion", "kick drum", "snare", "hi-hats", "drum beat"]
    if has_backing:
        lead_layers.append("bassline and melody")
    else:
        # tested: with only "bass/lead melody" banned, a melody/riff still kicked in after the 3 s intro
        missing += ["bass", "bassline", "808", "sub bass", "melody", "lead melody", "lead synth", "piano melody",
                    "arpeggio", "riff", "hook", "solo", "topline", "countermelody"]
        if has_drums:
            layers += ["only chords and drums", "no melody", "minimal arrangement"]
    if not has_drums and not has_backing:
        layers += ["sparse, minimal arrangement", "chords and atmosphere only"]

    tempo = [f"{vibe['bpm']} BPM"] if vibe.get("bpm") else []
    if vibe.get("key"):
        tempo.append(f"in the key of {vibe['key']}")
    positive = lead_layers + styles + tempo + layers + ["instrumental", "great production quality"] + words
    negative = list(dict.fromkeys(list(vibe.get("negative_styles", [])) + ["vocals", "singing", "spoken word"] + missing))

    first = {
        "text": "[Intro]\n{the beat continues}" if prev_song_id else
                "[Intro]\n{only soft chords and atmosphere, no drums, no bass}" if not parts else "[Intro]",
        "duration_ms": intro,
        "positive_styles": positive,
        "negative_styles": negative,
    }
    if prev_song_id:
        first["conditioning_ref"] = {"song_id": prev_song_id, "range": {"start_ms": 0, "end_ms": intro}}
        first["condition_strength"] = os.environ.get("CONDITION_STRENGTH", "high")
    # Say which earlier layers keep going and what enters now (tested: without this, earlier drums drop out)
    new_kind = parts[-1].get("kind") if new_words and parts else None
    earlier = {p.get("kind") for p in parts[:-1]} if new_kind else kinds
    keep = []
    if "drums" in earlier and new_kind != "drums":
        keep.append("the drums and kick keep playing")
    if earlier & {"melody", "bass", "texture"} and new_kind not in ("melody", "bass", "texture"):
        keep.append("the bassline and melody keep playing")
    if new_words:
        enters = ", ".join(new_words[:2]) + (" and a bassline" if new_kind in ("melody", "bass") else "") + " enter"
        if not has_backing:
            enters += "; the soft chords continue unchanged; no melody, no bass, nothing else enters"
    else:
        enters = ("the groove continues" + ("" if has_backing else "; no melody, no bass")) if parts \
            else "soft chords and atmosphere only, no drums, no bass"
    main_text = "[Main]\n{" + "; ".join(keep + [enters]) + "}"
    second = {"text": main_text, "duration_ms": main, "positive_styles": positive, "negative_styles": negative}
    if prev_song_id and mode == "short":
        # Drums: medium adherence keeps the existing chords (tested: low let a random melody kick in after the
        # intro, medium gave stronger drums and less melodic content). Backing parts need low to come through.
        second["context_adherence"] = "medium" if new_kind == "drums" else os.environ.get("MAIN_ADHERENCE", "low")
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
