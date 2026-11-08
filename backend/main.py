"""Loopstack backend: vibes, ElevenLabs sounds, Daytona analysis. Run: uvicorn main:app --reload --port 8000"""
from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")  # before importing modules that read env vars

import os  # noqa: E402

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import eleven  # noqa: E402
import vibes as V  # noqa: E402
from runners import AnalysisError, get_runner, runner_status, start_runners, stop_runners  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("loopstack")

FILES = Path(__file__).resolve().parent / "files"
CACHE = FILES / "cache"
SESS = FILES / "sessions"
for d in (CACHE, SESS):
    d.mkdir(parents=True, exist_ok=True)

SESSIONS: dict[str, dict] = {}
POOL = ThreadPoolExecutor(max_workers=4)  # ElevenLabs limits concurrent requests per plan
KINDS = {"drum": "hit", "melody": "melody", "bass": "bass", "texture": "texture"}


@asynccontextmanager
async def lifespan(_app):
    start_runners()  # boots the Daytona sandbox in the background so it's warm before the first take
    yield
    stop_runners()


app = FastAPI(title="Loopstack", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/files", StaticFiles(directory=str(FILES)), name="files")


# ---------------------------------------------------------------- helpers
def file_url(p: Path) -> str:
    return "/files/" + p.relative_to(FILES).as_posix()


def get_session(sid: str) -> dict:
    s = SESSIONS.get(sid)
    if not s:
        raise HTTPException(404, "Session not found. Set a vibe first.")
    return s


def find_part(s: dict, pid: str) -> dict:
    for p in s["parts"]:
        if p["id"] == pid:
            return p
    raise HTTPException(404, "Part not found.")


def generate_kit(v: dict) -> tuple[dict, dict, list[str]]:
    """Drum kit + instrument notes for a vibe, generated in parallel with ElevenLabs Sound Effects."""
    jobs = {}
    for slot, desc in v["kit_prompts"].items():
        jobs[("kit", slot)] = POOL.submit(eleven.sound_effect, CACHE, V.hit_prompt(desc), V.HIT_SECONDS[slot])
    for role, desc in v["instrument_prompts"].items():
        jobs[("inst", role)] = POOL.submit(eleven.sound_effect, CACHE, V.note_prompt(desc, role), 2.0)
    kit, inst, errors = {}, {}, []
    for (group, name), fut in jobs.items():
        try:
            url = file_url(fut.result())
        except Exception as e:  # one bad sound shouldn't kill the session
            errors.append(f"{name}: {e}")
            url = None
        (kit if group == "kit" else inst)[name] = url
    if not any(kit.values()):
        raise HTTPException(502, "ElevenLabs couldn't make the drum kit: " + "; ".join(errors)[:500])
    return kit, inst, errors


def make_vibe(text: str) -> tuple[dict, list[str]]:
    v = V.build_vibe(text)
    v["kit"], v["instruments"], errors = generate_kit(v)
    return v, errors


def unique_name(s: dict, name: str) -> str:
    base = (name or "part").strip().lower()[:24] or "part"
    names = {p["name"] for p in s["parts"]}
    if base not in names:
        return base
    i = 2
    while f"{base} {i}" in names:
        i += 1
    return f"{base} {i}"


DEFAULT_NAMES = {"drum": "clap", "melody": "hum", "bass": "bass hum", "texture": "texture"}


# ---------------------------------------------------------------- routes
class VibeIn(BaseModel):
    vibe_text: str = "chill lo-fi"


class PartPatch(BaseModel):
    slot: Optional[str] = None
    muted: Optional[bool] = None
    volume: Optional[float] = None
    name: Optional[str] = None


class BackingIn(BaseModel):
    style: Optional[str] = None


@app.get("/api/health")
def health():
    return {"ok": True, **runner_status(), "elevenlabs": bool(os.getenv("ELEVENLABS_API_KEY", "").strip())}


@app.get("/api/vibes")
def list_vibes():
    return V.preset_summaries()


@app.post("/api/sessions")
def create_session(body: VibeIn):
    v, errors = make_vibe(body.vibe_text)
    sid = uuid.uuid4().hex[:10]
    s = {"id": sid, "vibe": v, "parts": [], "warnings": errors}
    SESSIONS[sid] = s
    (SESS / sid).mkdir(parents=True, exist_ok=True)
    return s


@app.post("/api/sessions/{sid}/vibe")
def change_vibe(sid: str, body: VibeIn):
    """Curveball-proof: a new vibe keeps every part. Hums move to the new key, claps stay claps."""
    s = get_session(sid)
    old = s["vibe"]
    v, errors = make_vibe(body.vibe_text)
    shift = V.transpose_interval(old["tonic"], v["tonic"])
    for p in s["parts"]:
        if p.get("notes"):
            p["notes"] = V.retune(p["notes"], shift, v["tonic"], v["scale"])
    s["parts"] = [p for p in s["parts"] if p["kind"] != "backing"]  # composed for the old vibe
    s["vibe"], s["warnings"] = v, errors
    return s


@app.post("/api/sessions/{sid}/parts")
def add_part(sid: str, audio: UploadFile = File(...), kind: str = Form(...), name: str = Form(""),
             slot: str = Form(""), pre_roll: float = Form(0.0), steps: int = Form(32)):
    s = get_session(sid)
    v = s["vibe"]
    kind = kind.strip().lower()
    if kind not in KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(KINDS)}")
    steps = int(max(4, min(128, steps)))
    pre_roll = float(max(0.0, min(1.0, pre_roll)))
    data = audio.file.read()
    if len(data) < 2000:
        raise HTTPException(400, "The recording was empty.")

    pid = uuid.uuid4().hex[:8]
    pdir = SESS / sid / pid
    pdir.mkdir(parents=True, exist_ok=True)
    (pdir / "take.wav").write_bytes(data)
    args = ["--kind", KINDS[kind], "--bpm", str(v["bpm"]), "--tonic", str(v["tonic"]), "--scale", v["scale"],
            "--steps", str(steps), "--pre-roll", f"{pre_roll:.4f}"]
    try:
        result, files = get_runner().run(data, args)
    except AnalysisError as e:
        log.warning("analysis failed: %s", e)
        raise HTTPException(503, str(e))
    except Exception as e:  # never a bare 500: the error terminal should show what happened
        log.exception("analysis crashed")
        raise HTTPException(503, f"Analysis crashed: {type(e).__name__}: {e}")
    if not result.get("ok"):
        raise HTTPException(500, f"Analysis failed: {result.get('error')}")
    for fname, blob in files.items():
        (pdir / fname).write_bytes(blob)

    part = {"id": pid, "kind": kind, "muted": False, "volume": 0.0, "raw_url": file_url(pdir / "take.wav"),
            "analysis": {k: val for k, val in result.items() if k != "notes"}}
    if kind == "drum":
        if not result.get("hits") or "sample" not in result:
            raise HTTPException(422, result.get("message") or "I couldn't hear a clear hit.")
        part["slot"] = slot if slot in V.SLOTS else result.get("slot", "snare")
        part["sample_url"] = file_url(pdir / result["sample"])
    elif kind in ("melody", "bass"):
        if not result.get("notes"):
            raise HTTPException(422, result.get("message") or "I couldn't hear a clear tune.")
        part["notes"] = result["notes"]
        part["loop_steps"] = steps
    else:
        if "loop" not in result:
            raise HTTPException(422, result.get("message") or "That take was silent.")
        part["loop_url"] = file_url(pdir / result["loop"])
        part["loop_steps"] = steps
        part["volume"] = -4.0
    part["name"] = unique_name(s, name or DEFAULT_NAMES[kind])
    s["parts"].append(part)
    log.info("part %s (%s) via %s", part["name"], kind, result.get("runner"))
    return {"session": s, "part": part}


@app.patch("/api/sessions/{sid}/parts/{pid}")
def update_part(sid: str, pid: str, body: PartPatch):
    s = get_session(sid)
    p = find_part(s, pid)
    if body.slot is not None:
        if p["kind"] != "drum":
            raise HTTPException(400, "Only drum parts have a kit slot.")
        if body.slot not in V.SLOTS:
            raise HTTPException(400, f"slot must be one of {V.SLOTS}")
        p["slot"] = body.slot
    if body.muted is not None:
        p["muted"] = bool(body.muted)
    if body.volume is not None:
        p["volume"] = float(max(-40.0, min(6.0, body.volume)))
    if body.name:
        p["name"] = unique_name(s, body.name)
    return s


@app.delete("/api/sessions/{sid}/parts/{pid}")
def delete_part(sid: str, pid: str):
    s = get_session(sid)
    find_part(s, pid)
    s["parts"] = [p for p in s["parts"] if p["id"] != pid]
    return s


@app.post("/api/sessions/{sid}/backing")
def add_backing(sid: str, body: BackingIn):
    s = get_session(sid)
    v = s["vibe"]
    loop_s = v["bars"] * 240.0 / v["bpm"]
    loops = max(1, round(30.0 / loop_s))
    length_ms = int(min(120000, max(10000, loops * loop_s * 1000)))
    prompt = V.backing_prompt(v, body.style)
    try:
        path = eleven.compose_music(CACHE, prompt, length_ms)
    except eleven.ElevenLabsError as e:
        raise HTTPException(502, str(e))
    s = get_session(sid)  # re-read: the vibe may have changed while the track was composing
    s["parts"] = [p for p in s["parts"] if p["kind"] != "backing"]
    s["parts"].append({"id": uuid.uuid4().hex[:8], "name": "backing track", "kind": "backing", "muted": False,
                       "volume": -9.0, "loop_url": file_url(path), "prompt": prompt})
    return s
