import argparse
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

URL = "https://api.elevenlabs.io/v1/music"
BASE = ["chill lo-fi hip hop", "80 BPM", "instrumental"]
NEGATIVE = ["vocals", "singing"]


def generate(key, name, drums, seed, model, song_id=None, strength="high"):
    first = {
        "text": "[Intro]\n{beat continues}",
        "duration_ms": 8000,
        "positive_styles": BASE + [drums],
        "negative_styles": NEGATIVE,
    }
    if song_id:
        first["conditioning_ref"] = {
            "song_id": song_id,
            "range": {"start_ms": 0, "end_ms": 8000},
        }
        first["condition_strength"] = strength
    body = {
        "model_id": model,
        "seed": seed,
        "store_for_inpainting": True,
        "composition_plan": {
            "chunks": [
                first,
                {
                    "text": "[Main]\n{a soaring rhodes melody enters}" if song_id else "[Main]\n{steady beat}",
                    "duration_ms": 12000,
                    "positive_styles": BASE + [drums],
                    "negative_styles": NEGATIVE,
                },
            ]
        },
    }
    start = time.time()
    response = requests.post(
        URL,
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": key},
        json=body,
        timeout=300,
    )
    elapsed = time.time() - start
    print(f"\n{name}: HTTP {response.status_code} in {elapsed:.1f}s")
    for header, value in response.headers.items():
        print(f"  {header}: {value}")
    if not response.ok:
        print(response.text)
        raise SystemExit(1)
    path = Path(__file__).parent / "out" / f"{name}.mp3"
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(response.content)
    print(f"  saved {path}")
    return next((v for h, v in response.headers.items() if "song" in h.lower() and "id" in h.lower()), None)


def main():
    load_dotenv(Path(__file__).parent.parent / ".env")
    parser = argparse.ArgumentParser()
    parser.add_argument("--song-id")
    parser.add_argument("--model", default="music_v2")
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--strength", default="high")
    args = parser.parse_args()
    key = os.environ["ELEVENLABS_API_KEY"]

    song_id = args.song_id or generate(key, "v1", "laid-back sparse drums", args.seed, args.model)
    print(f"\nsong_id: {song_id}")
    if not song_id:
        print("No song id header detected. Find it in the headers above, then rerun with --song-id VALUE.")
        return
    generate(key, "v2_conditioned", "laid-back sparse drums", args.seed, args.model, song_id, args.strength)
    generate(key, "busy", "driving busy punchy drums, lots of hi-hats", args.seed, args.model)
    generate(key, "sparse", "very sparse soft brushed drums", args.seed, args.model)


if __name__ == "__main__":
    main()
