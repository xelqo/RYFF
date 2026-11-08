"""Create (or update) the "producer" ElevenLabs agent + its 5 client tools, and write ELEVENLABS_AGENT_ID to .env.

    cd backend && .venv/bin/python create_agent.py            # create, or update the agent already in .env
    .venv/bin/python create_agent.py --voice <voice_id>       # pick another voice

The system prompt and first message are read from docs/AGENT.md so the doc stays the source of truth.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
API = "https://api.elevenlabs.io/v1/convai"
DEFAULT_VOICE = "IKne3meq5aSn9XLyUdCD"   # Charlie: deep, confident, energetic

EXTRA_RULES = """
- After play_version returns, stay silent until the user taps "Talk to producer" or speaks to you again.
- Never claim you heard a take unless record_sound returned traits. If it returns an error, ask them to try again.
- A generation error means the previous song is still available: offer to retry, never announce success.
- Sounds come in two kinds: drums (kind "drums") and a backing track (kind "melody"). Any sound works for either,
  and they can also upload audio files on screen.
"""

KIND = {"type": "string", "enum": ["drums", "melody"],
        "description": "drums, or melody for the backing track"}
TOOLS = [
    ("set_vibe", "Start the song in a vibe, or change the vibe (recorded sounds are kept). Returns as soon as "
                 "generation starts; a context update tells you when the version is ready.",
     {"vibe_text": {"type": "string", "description": "the vibe in the user's own words"}}, ["vibe_text"], 20),
    ("record_sound", "Records the user's sound after a beep (music is paused, you are muted while recording). "
                     "Tell them what to do BEFORE calling. Returns the traits heard, or an error to retry.",
     {"kind": KIND}, ["kind"], 45),
    ("play_version", "Play a ready version of the song. Leave n empty for the latest.",
     {"n": {"type": "integer", "description": "version number, 1 or more"}}, [], 15),
    ("skip_part", "Skip a kind of sound the user doesn't want to add.", {"kind": KIND}, ["kind"], 10),
    ("download_song", "Download the version that is currently selected.", {}, [], 20),
]


def doc_parts() -> tuple[str, str]:
    text = (ROOT / "docs" / "AGENT.md").read_text()
    first = re.search(r"\*\*First message:\*\* `([^`]+)`", text).group(1)
    prompt = re.search(r"\*\*System prompt:\*\*\s*```\n(.*?)```", text, re.S).group(1).strip()
    return first, prompt + "\n" + EXTRA_RULES


def call(method: str, path: str, key: str, body: dict) -> dict:
    r = requests.request(method, f"{API}{path}", headers={"xi-api-key": key}, json=body, timeout=60)
    if not r.ok:
        raise RuntimeError(f"{method} {path} → {r.status_code}: {r.text[:800]}")
    return r.json()


def set_env(name: str, value: str) -> None:
    lines = ENV.read_text().splitlines() if ENV.exists() else []
    lines = [l for l in lines if not l.startswith(f"{name}=")] + [f"{name}={value}"]
    ENV.write_text("\n".join(lines) + "\n")


def main() -> None:
    load_dotenv(ENV)
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--llm", default="gemini-2.5-flash")
    args = ap.parse_args()
    key = os.environ["ELEVENLABS_API_KEY"]

    tool_ids = []
    for name, desc, props, required, timeout in TOOLS:
        cfg = {"type": "client", "name": name, "description": desc, "expects_response": True,
               "response_timeout_secs": timeout,
               "parameters": {"type": "object", "properties": props, "required": required}}
        tool = call("POST", "/tools", key, {"tool_config": cfg})
        tool_ids.append(tool["id"])
        print(f"tool {name}: {tool['id']}")

    first, prompt = doc_parts()
    agent = {"agent": {"first_message": first, "language": "en",
                       "prompt": {"prompt": prompt, "llm": args.llm, "tool_ids": tool_ids}},
             "tts": {"voice_id": args.voice}}
    body = {"name": "Loopstack producer", "conversation_config": agent}

    existing = os.environ.get("ELEVENLABS_AGENT_ID", "").strip()
    try:
        if existing:
            call("PATCH", f"/agents/{existing}", key, body)
            agent_id = existing
            print(f"updated agent {agent_id}")
        else:
            agent_id = call("POST", "/agents/create", key, body)["agent_id"]
            print(f"created agent {agent_id}")
    except RuntimeError as e:
        if "llm" not in str(e).lower():
            raise
        print(f"llm {args.llm!r} rejected, using the default LLM", file=sys.stderr)
        del body["conversation_config"]["agent"]["prompt"]["llm"]
        agent_id = existing or call("POST", "/agents/create", key, body)["agent_id"]
        if existing:
            call("PATCH", f"/agents/{existing}", key, body)
    set_env("ELEVENLABS_AGENT_ID", agent_id)
    print(f"ELEVENLABS_AGENT_ID={agent_id} written to .env")


if __name__ == "__main__":
    main()
