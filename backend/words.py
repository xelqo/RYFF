"""Translate normalized audio traits into musical directions, without I/O."""
import math

KINDS = ("drums", "bass", "melody", "texture")


def _level(traits, key):
    value = traits.get(key, 0.5)
    if value is None:
        value = 0.5
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{key} must be a finite number")
    value = max(0.0, min(1.0, value))
    return 0 if value < 0.35 else 2 if value > 0.6 else 1


def traits_to_words(kind: str, traits: dict, vibe: dict) -> list[str]:
    """Use 0.35/0.6 thresholds, neutral missing traits, and no input mutation."""
    if kind not in KINDS:
        raise ValueError(f"unknown part kind: {kind}")
    if traits.get("error"):
        raise ValueError("cannot describe a rejected audio take")
    instrument = vibe.get("instruments", {}).get(kind, kind)
    busy = ("sparse, spacious", "steady", "busy, driving")[_level(traits, "busyness")]
    punch = ("soft, gentle attacks", "crisp attacks", "punchy, strong attacks")[_level(traits, "punch")]
    tone = ("warm, dark tone", "balanced tone", "bright, shimmering tone")[_level(traits, "brightness")]
    if kind == "drums":
        return [f"{busy} {instrument}", punch, tone]
    if kind == "texture":
        return [f"{tone} {instrument}", f"{busy} background texture", punch]
    register = traits.get("pitch_register") or ("low" if kind == "bass" else "mid")
    contour = traits.get("contour") or "flat"
    if register not in ("low", "mid", "high") or contour not in ("rising", "falling", "arch", "flat"):
        raise ValueError("invalid pitch register or contour")
    shape = {"rising": "rising phrase", "falling": "descending phrase", "arch": "arching phrase", "flat": "level phrase"}[contour]
    articulation = ("plucky, staccato", "lightly connected", "smooth, legato")[_level(traits, "smoothness")]
    return [f"{articulation} {instrument} in a {register} register", shape, f"{busy} {kind}", tone]
