"""Generate and cache every preset vibe's kit before the demo:  python prewarm.py [genre ...]"""
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import eleven  # noqa: E402
import vibes as V  # noqa: E402

CACHE = Path(__file__).resolve().parent / "files" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

genres = sys.argv[1:] or list(V.PRESETS)
for g in genres:
    v = V.build_vibe(g)
    print(f"== {v['label']}")
    for slot, desc in v["kit_prompts"].items():
        print("  kit ", slot, eleven.sound_effect(CACHE, V.hit_prompt(desc), V.HIT_SECONDS[slot]).name)
    for role, desc in v["instrument_prompts"].items():
        print("  inst", role, eleven.sound_effect(CACHE, V.note_prompt(desc, role), 2.0).name)
print("done")
