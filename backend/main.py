"""Loopstack backend. Run: cd backend && .venv/bin/uvicorn main:app --reload --port 8000"""
from __future__ import annotations

import logging
import os
import random
import threading
import time
import traceback
import uuid
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("loopstack")

import music  # noqa: E402
from contrib import runner, traits_to_words, vibe_from_text  # noqa: E402

DATA = ROOT / "data"
CACHE = ROOT / "cache"          # pre-generated v1 per preset vibe (filled by scripts/prewarm or the first run)
DATA.mkdir(exist_ok=True)
CACHE.mkdir(exist_ok=True)
KINDS = {"drums", "bass", "melody", "texture"}

app = FastAPI(title="Loopstack")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/files", StaticFiles(directory=DATA), name="files")

SESSIONS: dict[str, dict] = {}
LOCKS: dict[str, threading.Lock] = {}


# ------------------------------------------------------------------ helpers
def url_for(path: Path) -> str:
    return "/files/" + path.relative_to(DATA).as_posix()


def public(s: dict) -> dict:
    return {k: v for k, v in s.items() if not k.startswith("_")}


def get_session(sid: str) -> dict:
    s = SESSIONS.get(sid)
    if not s:
        raise HTTPException(404, "session not found")
    return s


def make_vibe(text: str) -> dict:
    v = vibe_from_text(text)
    return {"text": text, **v}


def build_version(sid: str, reason: str, new_words: list[str] | None, from_version: int | None,
                  condition: bool) -> None:
    """Runs in the background: plan → ElevenLabs Music → mix → append a Version."""
    s = SESSIONS[sid]
    with LOCKS[sid]:                         # one generation at a time per session, in request order
        s["status"], s["error"] = "building", None
        try:
            prev = None
            if condition and s["versions"]:
                base = next((v for v in s["versions"] if v["n"] == from_version), None) if from_version else None
                prev = (base or s["versions"][-1]).get("song_id")
            plan = music.build_plan(s["vibe"], s["parts"], prev, new_words)
            n = len(s["versions"]) + 1
            folder = DATA / sid
            raw = folder / f"v{n}.raw.mp3"

            # Preset vibes (exact preset text, first version) are served from / saved to backend/cache/
            name = s["vibe"]["name"]
            is_preset = n == 1 and s["vibe"]["text"].lower().strip() in PRESET_TEXT.get(name, [])
            use_cache = is_preset and os.environ.get("USE_CACHE", "1") == "1"
            cached_mp3, cached_id = CACHE / f"{name}.mp3", CACHE / f"{name}.song_id"
            if use_cache and cached_mp3.exists():
                raw.write_bytes(cached_mp3.read_bytes())
                song_id = cached_id.read_text().strip() or None if cached_id.exists() else None
                log.info("v1 from cache (%s)", name)
            else:
                audio, song_id, _ = music.generate(plan, s["seed"])
                raw.write_bytes(audio)
                if use_cache:
                    cached_mp3.write_bytes(audio)
                    cached_id.write_text(song_id or "")

            hits = [p["_hit_path"] for p in s["parts"] if p["kind"] == "drums" and p.get("_hit_path")]
            mixed = Path(runner.mix(str(raw), hits)) if hits else raw
            s["versions"].append({
                "n": n, "song_id": song_id, "url": url_for(mixed), "plan": plan, "reason": reason,
                "from_version": from_version, "conditioned": bool(prev), "created_at": time.time(),
            })
            s["status"] = "ready"
            log.info("session %s: v%d ready (%s)", sid, n, reason)
        except Exception as e:  # surface to the frontend instead of dying silently
            traceback.print_exc()
            s["status"], s["error"] = "error", str(e)


PRESET_TEXT = {"lofi": ["chill lo-fi", "lo-fi", "lofi"], "trap": ["dark trap", "trap"],
               "house": ["summer house", "house"], "pop": ["upbeat pop", "pop"]}


# ------------------------------------------------------------------ endpoints
class VibeIn(BaseModel):
    vibe_text: str


@app.get("/health")
def health():
    return {"ok": True, "elevenlabs_key": bool(os.environ.get("ELEVENLABS_API_KEY")),
            "agent_id": bool(os.environ.get("ELEVENLABS_AGENT_ID")), "runner": type(runner).__name__,
            **(runner.status() if hasattr(runner, "status") else {})}


@app.post("/sessions")
def create_session(body: VibeIn, bg: BackgroundTasks):
    sid = uuid.uuid4().hex[:8]
    (DATA / sid).mkdir()
    s = {"id": sid, "vibe": make_vibe(body.vibe_text), "parts": [], "versions": [],
         "seed": random.randint(1, 2**31 - 1), "status": "building", "error": None}
    SESSIONS[sid], LOCKS[sid] = s, threading.Lock()
    threading.Thread(target=runner.start, args=(sid,), daemon=True).start()   # warm the sandbox
    bg.add_task(build_version, sid, "vibe", None, None, False)
    return public(s)


@app.patch("/sessions/{sid}/vibe")
def change_vibe(sid: str, body: VibeIn, bg: BackgroundTasks):
    s = get_session(sid)
    s["vibe"], s["status"] = make_vibe(body.vibe_text), "building"
    # keep every part's raw take but re-word it for the new vibe's instruments; no conditioning on the old beat
    for p in s["parts"]:
        p["words"] = traits_to_words(p["kind"], p["traits"], s["vibe"])
    bg.add_task(build_version, sid, "vibe", None, None, False)
    return {"status": "building", "vibe": s["vibe"]}


@app.post("/sessions/{sid}/parts")
def add_part(sid: str, bg: BackgroundTasks, audio: UploadFile = File(...), kind: str = Form(...),
             from_version: int | None = Form(None)):
    s = get_session(sid)
    if kind not in KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(KINDS)}")
    pid = uuid.uuid4().hex[:6]
    ext = Path(audio.filename or "take.webm").suffix or ".webm"
    raw = DATA / sid / f"part_{pid}{ext}"
    raw.write_bytes(audio.file.read())

    try:
        traits = runner.analyse(str(raw), kind, bpm=s["vibe"]["bpm"])
    except TypeError:                      # stub runner takes no bpm
        traits = runner.analyse(str(raw), kind)
    if traits.get("error"):
        raw.unlink(missing_ok=True)
        return {"part": None, "status": s["status"], "error": traits["error"]}   # agent: "too quiet, ask again"

    hit_path = traits.pop("_hit_path", None)
    words = traits_to_words(kind, traits, s["vibe"])
    part = {"id": pid, "kind": kind, "raw_url": url_for(raw), "traits": traits, "words": words,
            "_raw_path": str(raw), "_hit_path": hit_path}
    if hit_path:
        part["hit_url"] = url_for(Path(hit_path))
    s["parts"].append(part)
    s["status"] = "building"
    bg.add_task(build_version, sid, f"added {kind}", words, from_version, True)
    return {"part": public(part), "status": "building"}


@app.get("/sessions/{sid}")
def read_session(sid: str):
    s = get_session(sid)
    out = public(s)
    out["parts"] = [public(p) for p in s["parts"]]
    return out


@app.get("/agent-token")
def agent_token():
    agent_id, key = os.environ.get("ELEVENLABS_AGENT_ID"), os.environ.get("ELEVENLABS_API_KEY")
    if not agent_id or not key:
        raise HTTPException(500, "set ELEVENLABS_AGENT_ID and ELEVENLABS_API_KEY in .env")
    r = requests.get("https://api.elevenlabs.io/v1/convai/conversation/token",
                     params={"agent_id": agent_id}, headers={"xi-api-key": key}, timeout=20)
    if not r.ok:
        raise HTTPException(r.status_code, r.text[:300])
    return {"token": r.json()["token"]}
