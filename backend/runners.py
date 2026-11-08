"""Runs sandbox/analyse.py inside ONE warm Daytona sandbox (created when the server starts).

LOCAL_ANALYSIS_FALLBACK=1 runs the same script locally instead. Use it only while developing:
the demo has to run in Daytona.
"""
from __future__ import annotations

import json
import logging
import os
import shlex
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "sandbox" / "analyse.py"
REMOTE = "/home/daytona/loopstack"
OUTPUT_KEYS = ("sample", "loop")  # result keys that name files the script wrote
log = logging.getLogger("loopstack.analysis")


class AnalysisError(RuntimeError):
    pass


def _parse(output: str) -> dict:
    for line in reversed((output or "").strip().splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    raise AnalysisError(f"analyse.py printed no JSON. Output: {(output or '')[-600:]}")


class DaytonaRunner:
    name = "daytona"

    def __init__(self):
        self.status, self.error = "off", None
        self.daytona = self.sandbox = None
        self._ready = threading.Event()
        self._lock = threading.Lock()

    def start(self):
        if not os.getenv("DAYTONA_API_KEY", "").strip():
            self.status, self.error = "no-key", "DAYTONA_API_KEY is not set in .env"
            self._ready.set()
            return
        self.status = "starting"
        threading.Thread(target=self._boot, daemon=True).start()

    def _boot(self):
        try:
            from daytona import Daytona  # pip install daytona

            self.daytona = Daytona()  # reads DAYTONA_API_KEY (and DAYTONA_API_URL if set)
            self.sandbox = self._create()
            self._exec(f"mkdir -p {REMOTE}/jobs")
            self.sandbox.fs.upload_file(SCRIPT.read_bytes(), f"{REMOTE}/analyse.py")
            r = self._exec('python3 -c "import numpy"')
            if getattr(r, "exit_code", 1) != 0:
                r = self._exec("python3 -m pip install -q numpy", timeout=300)
                if getattr(r, "exit_code", 1) != 0:
                    raise AnalysisError(f"numpy install failed: {(getattr(r, 'result', '') or '')[-300:]}")
            self.status = "ready"
            log.info("Daytona sandbox ready: %s", getattr(self.sandbox, "id", "?"))
        except Exception as e:  # keep the server up; /api/health shows the error
            log.exception("Daytona startup failed")
            self.status, self.error = "error", f"{type(e).__name__}: {e}"
        finally:
            self._ready.set()

    def _create(self):
        try:
            from daytona import CreateSandboxFromSnapshotParams

            # auto-stop after 30 idle minutes so a crashed server doesn't leave it running forever
            return self.daytona.create(CreateSandboxFromSnapshotParams(language="python", auto_stop_interval=30))
        except (ImportError, TypeError) as e:
            log.warning("Using default sandbox params (%s)", e)
            return self.daytona.create()

    def _exec(self, cmd: str, timeout: int = 120):
        return self.sandbox.process.exec(cmd, timeout=timeout)

    def run(self, wav: bytes, args: list[str]) -> tuple[dict, dict]:
        if not self._ready.wait(timeout=120):
            raise AnalysisError("The Daytona sandbox is still starting. Try again in a few seconds.")
        if self.status != "ready":
            raise AnalysisError(f"Daytona sandbox unavailable: {self.error}")
        job = f"{REMOTE}/jobs/{uuid.uuid4().hex[:8]}"
        with self._lock:
            self._exec(f"mkdir -p {job}")
            self.sandbox.fs.upload_file(wav, f"{job}/take.wav")
            cmd = " ".join(shlex.quote(a) for a in
                           ["python3", f"{REMOTE}/analyse.py", f"{job}/take.wav", *args, "--out", job])
            r = self._exec(cmd)
            result = _parse(getattr(r, "result", "") or "")
            files = {}
            for key in OUTPUT_KEYS:
                name = result.get(key)
                if name:
                    files[name] = self.sandbox.fs.download_file(f"{job}/{name}")
        result["runner"] = self.name
        return result, files

    def stop(self):
        if self.sandbox is None:
            return
        try:
            self.sandbox.delete()
        except Exception:
            try:
                self.daytona.delete(self.sandbox)
            except Exception:
                log.warning("Couldn't delete the sandbox; it auto-stops after 30 idle minutes.")


class LocalRunner:
    name = "local"

    def run(self, wav: bytes, args: list[str]) -> tuple[dict, dict]:
        with tempfile.TemporaryDirectory() as d:
            take = Path(d) / "take.wav"
            take.write_bytes(wav)
            p = subprocess.run([sys.executable, "-I", str(SCRIPT), str(take), *args, "--out", d],
                               capture_output=True, text=True, timeout=120)
            result = _parse(p.stdout or p.stderr)
            files = {}
            for key in OUTPUT_KEYS:
                name = result.get(key)
                if name and (Path(d) / name).exists():
                    files[name] = (Path(d) / name).read_bytes()
        result["runner"] = self.name
        return result, files


DAYTONA = DaytonaRunner()
LOCAL = LocalRunner()


def fallback_enabled() -> bool:
    return os.getenv("LOCAL_ANALYSIS_FALLBACK", "0").strip() == "1"


def start_runners():
    DAYTONA.start()


def stop_runners():
    DAYTONA.stop()


def get_runner():
    if DAYTONA.status in ("ready", "starting"):
        return DAYTONA
    if fallback_enabled():
        log.warning("Daytona unavailable (%s); analysing locally", DAYTONA.error)
        return LOCAL
    raise AnalysisError(f"Daytona sandbox unavailable ({DAYTONA.error}). Check DAYTONA_API_KEY, "
                        f"or set LOCAL_ANALYSIS_FALLBACK=1 while developing.")


def runner_status() -> dict:
    daytona_ok = DAYTONA.status in ("ready", "starting")
    return {"sandbox": DAYTONA.status, "sandbox_error": DAYTONA.error, "fallback": fallback_enabled(),
            "mode": "daytona" if daytona_ok else ("local" if fallback_enabled() else "unavailable")}
