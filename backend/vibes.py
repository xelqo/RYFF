"""Deterministic preset selection; matches backend/contrib.py's contract."""
from copy import deepcopy
import re

PRESETS = {
    "lofi": {
        "styles": ["chill lo-fi hip hop", "dusty vinyl warmth", "laid-back swing"],
        "bpm": 80,
        "instruments": dict(drums="brushed lo-fi drums", bass="warm muted bass", melody="rhodes electric piano", texture="dusty vinyl ambience"),
    },
    "trap": {
        "styles": ["dark trap", "moody minor-key atmosphere", "half-time groove"],
        "bpm": 140,
        "instruments": dict(drums="trap drums and hi-hats", bass="deep 808 bass", melody="dark bell synth", texture="eerie ambient pad"),
    },
    "house": {
        "styles": ["summer house", "four-on-the-floor groove", "uplifting dance energy"],
        "bpm": 124,
        "instruments": dict(drums="house kick and claps", bass="bouncy synth bass", melody="bright piano lead", texture="airy atmospheric pad"),
    },
    "pop": {
        "styles": ["upbeat pop", "catchy instrumental hooks", "polished production"],
        "bpm": 110,
        "instruments": dict(drums="tight pop drums", bass="electric bass", melody="bright synth lead", texture="shimmering pad"),
    },
}
KEYWORDS = {
    "lofi": ("lofi", "lo fi", "chill", "study", "relax", "mellow"),
    "trap": ("trap", "dark", "drill", "rap", "hip hop"),
    "house": ("house", "summer", "dance", "edm", "club", "beach"),
    "pop": ("pop", "happy", "upbeat", "fun"),
}


def vibe_from_text(text: str) -> dict:
    """Prefer explicit genres, then keyword counts; ties/unknowns use lo-fi.

    Returns fresh nested values so one session cannot alter another's presets.
    This is keyword matching, not semantic understanding or negation parsing.
    """
    if not isinstance(text, str):
        raise TypeError("vibe text must be a string")
    normalized = " ".join(re.findall(r"[a-z0-9]+", text.lower()))
    padded = f" {normalized} "
    matches = lambda phrase: f" {phrase} " in padded
    explicit = {"lofi": ("lofi", "lo fi"), "trap": ("trap", "drill"), "house": ("house",), "pop": ("pop",)}
    scores = {name: 10 * any(matches(k) for k in explicit[name]) + sum(matches(k) for k in keywords)
              for name, keywords in KEYWORDS.items()}
    name = max(scores, key=scores.get)
    return {"name": name, **deepcopy(PRESETS[name]), "negative_styles": ["vocals", "singing"]}
