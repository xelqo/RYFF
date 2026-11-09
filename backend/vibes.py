"""Vibe profiles: the vibe decides tempo, key, groove, chords and instruments for the whole song."""
from __future__ import annotations

SLOTS = ["kick", "snare", "hat", "perc"]
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
SCALES = {"major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10]}
HIT_SECONDS = {"kick": 0.8, "snare": 0.6, "hat": 0.5, "perc": 0.5}
BARS = 4  # loop length; drum patterns repeat every bar, chords change every bar

# Drum patterns are 16th-note steps inside ONE bar (0-15). Progressions are scale degrees (0 = tonic).
PRESETS = {
    "lofi": {
        "label": "Chill lo-fi", "bpm": 80, "tonic": 57, "scale": "minor", "swing": 0.18,
        "pattern": {"kick": [0, 7, 10], "snare": [4, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14], "perc": [15]},
        "progression": [0, 5, 2, 6],
        "kit": {"kick": "dusty lo-fi hip hop kick drum", "snare": "soft lo-fi snare drum with vinyl crackle",
                "hat": "soft lo-fi closed hi-hat", "perc": "lo-fi rim shot click"},
        "instruments": {"lead": "mellow rhodes electric piano", "bass": "warm muted electric bass"},
        "keywords": ["lofi", "lo-fi", "lo fi", "chill", "study", "jazzy", "mellow", "relax", "coffee", "rainy"],
    },
    "trap": {
        "label": "Dark trap", "bpm": 140, "tonic": 53, "scale": "minor", "swing": 0.0,
        "pattern": {"kick": [0, 3, 10], "snare": [8], "hat": list(range(16)), "perc": [6, 14]},
        "progression": [0, 5, 3, 4],
        "kit": {"kick": "hard trap 808 kick drum with deep sub", "snare": "crisp trap snare clap",
                "hat": "sharp trap closed hi-hat tick", "perc": "trap rim click percussion"},
        "instruments": {"lead": "dark bell pluck synth", "bass": "deep 808 bass"},
        "keywords": ["trap", "dark", "drill", "hard", "808", "aggressive", "gritty"],
    },
    "house": {
        "label": "Summer house", "bpm": 124, "tonic": 55, "scale": "minor", "swing": 0.0,
        "pattern": {"kick": [0, 4, 8, 12], "snare": [4, 12], "hat": [2, 6, 10, 14], "perc": [3, 11]},
        "progression": [0, 5, 6, 0],
        "kit": {"kick": "punchy house kick drum", "snare": "bright house clap",
                "hat": "crisp open hi-hat", "perc": "shaker hit"},
        "instruments": {"lead": "bright house piano", "bass": "rubbery synth bass"},
        "keywords": ["house", "dance", "club", "edm", "summer", "disco", "techno", "party"],
    },
    "boombap": {
        "label": "90s boom bap", "bpm": 90, "tonic": 50, "scale": "minor", "swing": 0.22,
        "pattern": {"kick": [0, 10, 11], "snare": [4, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14], "perc": []},
        "progression": [0, 3, 0, 4],
        "kit": {"kick": "punchy boom bap kick drum", "snare": "crunchy boom bap snare",
                "hat": "dusty closed hi-hat", "perc": "vinyl shaker"},
        "instruments": {"lead": "soulful piano", "bass": "upright bass"},
        "keywords": ["boom bap", "boombap", "90s", "old school", "hip hop", "hiphop", "rap"],
    },
    "pop": {
        "label": "Happy pop", "bpm": 110, "tonic": 60, "scale": "major", "swing": 0.0,
        "pattern": {"kick": [0, 8, 10], "snare": [4, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14], "perc": [6, 14]},
        "progression": [0, 4, 5, 3],
        "kit": {"kick": "clean pop kick drum", "snare": "bright pop snare",
                "hat": "crisp closed hi-hat", "perc": "tambourine hit"},
        "instruments": {"lead": "bright synth pluck", "bass": "clean synth bass"},
        "keywords": ["pop", "happy", "upbeat", "bright", "sunny", "fun", "cheerful"],
    },
    "ambient": {
        "label": "Dreamy ambient", "bpm": 72, "tonic": 52, "scale": "major", "swing": 0.0,
        "pattern": {"kick": [0], "snare": [], "hat": [8], "perc": [12]},
        "progression": [0, 3, 5, 4],
        "kit": {"kick": "soft muffled kick drum", "snare": "gentle brush snare",
                "hat": "soft shaker", "perc": "small chime"},
        "instruments": {"lead": "soft glassy synth", "bass": "warm sub bass"},
        "keywords": ["ambient", "dreamy", "calm", "sleep", "space", "cinematic", "peaceful", "soft"],
    },
}


# "Sound like <artist>": we borrow the general style (genre, tempo, instruments), described in words.
# ElevenLabs Music refuses artist names, and we never imitate an artist's voice, lyrics or songs.
ARTISTS = {
    "travis scott": ("trap", "dark psychedelic trap, heavy distorted 808s, hazy reverb-drenched pads"),
    "metro boomin": ("trap", "cinematic dark trap, ominous orchestral stabs, booming 808s"),
    "drake": ("trap", "moody atmospheric r&b-trap, muted pads, sparse 808s"),
    "future": ("trap", "dark melodic trap, rolling hi-hats, deep 808 bass"),
    "billie eilish": ("trap", "dark minimal pop, whispery textures, deep sub bass"),
    "kanye": ("boombap", "soulful chopped soul samples, punchy drums, gospel chords"),
    "kendrick": ("boombap", "jazzy west coast hip hop, live bass, crisp drums"),
    "dr dre": ("boombap", "west coast g-funk, high synth lead, bouncy bass, crisp snare"),
    "dr. dre": ("boombap", "west coast g-funk, high synth lead, bouncy bass, crisp snare"),
    "j dilla": ("boombap", "off-kilter swung drums, warm dusty soul chords"),
    "nujabes": ("lofi", "jazzy lo-fi hip hop, mellow piano, soft swung drums"),
    "frank ocean": ("lofi", "warm minimal r&b, soft keys, airy pads"),
    "sza": ("lofi", "smooth neo-soul r&b, warm keys, laid-back groove"),
    "daft punk": ("house", "filtered french house, funky disco guitar, four-on-the-floor"),
    "fred again": ("house", "emotional uk house, chopped atmospheres, shuffling drums"),
    "calvin harris": ("house", "bright summer dance-pop house, big piano chords"),
    "avicii": ("house", "euphoric progressive house, folk-tinged melodies"),
    "taylor swift": ("pop", "polished synth-pop, bright pads, driving drums"),
    "the weeknd": ("pop", "retro 80s synthwave pop, gated drums, lush synths"),
    "dua lipa": ("pop", "nu-disco pop, funky bass, bright strings"),
    "tame impala": ("pop", "dreamy psychedelic synth-pop, phased drums, warm bass"),
    "bad bunny": ("pop", "reggaeton dembow groove, glossy synths, punchy bass"),
    "brian eno": ("ambient", "slow evolving ambient drones, soft piano"),
    "hans zimmer": ("ambient", "cinematic swelling strings, deep pulses"),
}


def find_artist(text: str) -> str | None:
    t = (text or "").lower()
    hits = [a for a in ARTISTS if a in t]
    return max(hits, key=len) if hits else None


def strip_artists(text: str) -> str:
    """Replace artist names with style descriptions so prompts never contain a name."""
    import re

    out = text or ""
    for a in sorted(ARTISTS, key=len, reverse=True):
        out = re.sub(re.escape(a), ARTISTS[a][1], out, flags=re.IGNORECASE)
    out = re.sub(r"\b(sound(s)? like|in the style of|inspired by|like)\b", "", out, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", out).strip(" ,")


def match_genre(text: str) -> str:
    t = (text or "").lower()
    if t.strip() in PRESETS:
        return t.strip()
    artist = find_artist(t)
    if artist:
        return ARTISTS[artist][0]
    best, best_score = "lofi", 0
    for genre, p in PRESETS.items():
        score = sum(len(k) for k in p["keywords"] if k in t)
        if score > best_score:
            best, best_score = genre, score
    return best


def chord(tonic: int, scale: str, degree: int) -> list[int]:
    sc = SCALES[scale]
    return [tonic + sc[(degree + k) % 7] + 12 * ((degree + k) // 7) for k in (0, 2, 4)]


def build_vibe(text: str) -> dict:
    genre = match_genre(text)
    p = PRESETS[genre]
    tonic, scale = p["tonic"], p["scale"]
    artist = find_artist(text)
    return {
        "text": (text or "").strip() or p["label"],
        "genre": genre,
        "label": f"{p['label']} · {artist.title()}-inspired" if artist else p["label"],
        "inspired_by": artist.title() if artist else None,
        "style": ARTISTS[artist][1] if artist else None,
        "bpm": p["bpm"],
        "key": f"{NOTE_NAMES[tonic % 12]} {scale}",
        "tonic": tonic,
        "scale": scale,
        "swing": p["swing"],
        "bars": BARS,
        "pattern": {s: list(p["pattern"].get(s, [])) for s in SLOTS},
        "chords": [chord(tonic, scale, d) for d in p["progression"]],
        "bass_roots": [tonic - 12 + SCALES[scale][d % 7] for d in p["progression"]],
        "kit_prompts": dict(p["kit"]),
        "instrument_prompts": dict(p["instruments"]),
    }


def hit_prompt(desc: str) -> str:
    return f"single {desc} one-shot hit, dry, isolated, no reverb, no music"


def note_prompt(desc: str, role: str) -> str:
    pitch = "C2" if role == "bass" else "C4"
    return f"single sustained {desc} note {pitch}, one note only, dry, isolated, no reverb, no chords"


def backing_prompt(v: dict, style: str | None) -> str:
    if (style or "").strip():
        base = strip_artists(style)
    else:  # an artist vibe's style words say it better than the user's raw sentence
        base = "" if v.get("style") else v["text"]
    extra = v.get("style") or ""
    if extra and extra in base:
        extra = ""
    genre_label = PRESETS[v["genre"]]["label"].lower()
    parts = [x for x in (base, extra, f"{genre_label} instrumental") if x]
    return f"{', '.join(parts)}, {v['bpm']} BPM, key of {v['key']}, steady tempo, loop-friendly, no vocals"


def transpose_interval(old_tonic: int, new_tonic: int) -> int:
    d = (new_tonic - old_tonic) % 12
    return d - 12 if d > 6 else d


def snap(m: int, tonic: int, scale: str) -> int:
    sc = SCALES[scale]
    pc = (m - tonic) % 12
    best = min(sc, key=lambda s: (min(abs(pc - s), 12 - abs(pc - s)), s))
    diff = best - pc
    if diff > 6:
        diff -= 12
    if diff < -6:
        diff += 12
    return int(m + diff)


def retune(notes: list[dict], shift: int, tonic: int, scale: str) -> list[dict]:
    return [{**n, "midi": snap(int(n["midi"]) + shift, tonic, scale)} for n in notes]


def preset_summaries() -> list[dict]:
    return [{"genre": g, "label": p["label"], "bpm": p["bpm"],
             "key": f"{NOTE_NAMES[p['tonic'] % 12]} {p['scale']}"} for g, p in PRESETS.items()]
