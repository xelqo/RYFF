"""A/B phrase audition. Default is offline; --generate spends API credits."""
import argparse
import json
import os
from pathlib import Path
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from vibes import vibe_from_text
from words import traits_to_words


def payloads(vibe_text, kind, duration, seed, model, trait):
    vibe = vibe_from_text(vibe_text)
    for label, value in (("low", 0.1), ("high", 0.9)):
        traits = dict(busyness=0.5, punch=0.5, brightness=0.5, smoothness=0.5)
        traits[trait] = value
        words = traits_to_words(kind, traits, vibe)
        yield label, words, {
            "model_id": model, "seed": seed,
            "composition_plan": {"chunks": [{
                "text": f"[Main]\n{{Instrumental groove with a clearly audible {kind} part}}",
                "duration_ms": duration * 1000,
                "positive_styles": vibe["styles"] + [f"{vibe['bpm']} BPM", "instrumental"] + words,
                "negative_styles": vibe["negative_styles"],
            }]},
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vibe", default="chill lo-fi")
    parser.add_argument("--kind", choices=("drums", "bass", "melody", "texture"), default="drums")
    parser.add_argument("--trait", choices=("busyness", "punch", "brightness", "smoothness"), default="busyness")
    parser.add_argument("--seconds", type=int, choices=range(15, 31), default=20)
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--model", default="music_v2")
    parser.add_argument("--generate", action="store_true")
    args = parser.parse_args()
    if args.trait == "smoothness" and args.kind not in ("bass", "melody"):
        parser.error("smoothness applies only to bass or melody")
    cases = list(payloads(args.vibe, args.kind, args.seconds, args.seed, args.model, args.trait))
    if not args.generate:
        print(json.dumps(cases, indent=2))
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
    except ImportError:
        pass  # An environment variable also works without python-dotenv.
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        parser.error("Set ELEVENLABS_API_KEY, or install python-dotenv and fill the repo .env")
    out = ROOT / "spikes" / "out" / f"listen-{time.time_ns()}"
    out.mkdir(parents=True)
    results = []
    for label, words, body in cases:
        (out / f"{label}.request.json").write_text(json.dumps(body, indent=2), encoding="utf-8")
        request = Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", data=json.dumps(body).encode(),
                          headers={"xi-api-key": key, "Content-Type": "application/json"}, method="POST")
        started = time.monotonic()
        try:
            with urlopen(request, timeout=300) as response:
                if not response.headers.get("Content-Type", "").lower().startswith(("audio/", "application/octet-stream")):
                    raise RuntimeError("Unexpected non-audio response; no MP3 saved")
                audio = response.read()
                if not audio:
                    raise RuntimeError("Empty audio response")
        except HTTPError as exc:
            raise SystemExit(f"Music request failed: HTTP {exc.code}; completed files remain in {out}") from None
        (out / f"{label}.mp3").write_bytes(audio)
        results.append(dict(case=label, words=words, elapsed_s=round(time.monotonic()-started, 2), listening_verdict="not reviewed"))
        (out / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"Saved {out / (label + '.mp3')}")


if __name__ == "__main__":
    main()
