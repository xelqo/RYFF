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
            threading.Thread(target=self._keepalive, daemon=True).start()
            log.info("Daytona sandbox ready: %s", getattr(self.sandbox, "id", "?"))
        except Exception as e:  # keep the server up; /api/health shows the error
            log.exception("Daytona startup failed")
            self.status, self.error = "error", f"{type(e).__name__}: {e}"
        finally:
            self._ready.set()

    LABELS = {"app": "loopstack"}

    def _reuse(self):
        """Reuse our labelled sandbox (start it if stopped) so server restarts don't pile up new sandboxes;
        stopped sandboxes still count against Daytona's 30 GiB disk limit."""
        pinned = os.getenv("DAYTONA_SANDBOX_ID", "").strip()
        if pinned:
            try:
                sb = self.daytona.get(pinned)
                if "started" not in str(getattr(sb, "state", "")).lower():
                    sb.start(timeout=120)
                log.info("Using pinned sandbox %s", sb.id)
                return sb
            except Exception as e:
                log.warning("Pinned sandbox %s unavailable (%s)", pinned, e)
        try:
            for sb in self.daytona.list():
                if (getattr(sb, "labels", None) or {}).get("app") != self.LABELS["app"]:
                    continue
                state = str(getattr(sb, "state", "")).lower()
                if "started" in state:
                    log.info("Reusing running sandbox %s", sb.id)
                    return sb
                if "stopped" in state or "archived" in state:
                    log.info("Starting stopped sandbox %s", sb.id)
                    sb.start(timeout=120)
                    return sb
        except Exception as e:  # never block startup on the reuse path
            log.warning("Couldn't reuse a sandbox (%s); creating a new one", e)
        return None

    def _create(self):
        existing = self._reuse()
        if existing is not None:
            return existing
        try:
            from daytona import CreateSandboxFromSnapshotParams

            # auto-stop after 30 idle minutes, auto-delete a day after stopping so old ones don't fill the disk
            return self.daytona.create(CreateSandboxFromSnapshotParams(
                language="python", labels=self.LABELS, auto_stop_interval=30, auto_delete_interval=24 * 60))
        except (ImportError, TypeError) as e:
            log.warning("Using default sandbox params (%s)", e)
            return self.daytona.create()

    def _exec(self, cmd: str, timeout: int = 60):
        return self.sandbox.process.exec(cmd, timeout=timeout)

    def ensure_awake(self):
        """Daytona auto-stops idle sandboxes (30 min). A stopped sandbox makes every call hang until it times
        out, so check the real state and start it again before using it."""
        if self.sandbox is None:
            return
        try:
            self.sandbox.refresh_data()
        except Exception as e:
            log.warning("Couldn't refresh sandbox state (%s)", e)
        state = str(getattr(self.sandbox, "state", "")).lower()
        if "started" not in state:
            log.info("Sandbox %s is %s; starting it", self.sandbox.id, state or "unknown")
            self.sandbox.start(timeout=90)

    def _keepalive(self):
        """Ping every 10 minutes so the sandbox never idles into auto-stop while the server runs."""
        import time
        while True:
            time.sleep(600)
            try:
                with self._lock:
                    self.ensure_awake()
                    self._exec("true", timeout=30)
            except Exception as e:
                log.warning("Sandbox keep-alive failed (%s)", e)

    def run(self, wav: bytes, args: list[str]) -> tuple[dict, dict]:
        if not self._ready.wait(timeout=120):
            raise AnalysisError("The Daytona sandbox is still starting. Try again in a few seconds.")
        if self.status != "ready":
            raise AnalysisError(f"Daytona sandbox unavailable: {self.error}")
        try:
            return self._run_once(wav, args)
        except AnalysisError:
            raise
        except Exception as e:                  # stopped/hung sandbox: wake it and retry once
            log.warning("Sandbox call failed (%s); waking it and retrying", e)
            with self._lock:
                self.ensure_awake()
            return self._run_once(wav, args)

    def _run_once(self, wav: bytes, args: list[str]) -> tuple[dict, dict]:
        job = f"{REMOTE}/jobs/{uuid.uuid4().hex[:8]}"
        with self._lock:
            self.ensure_awake()
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
