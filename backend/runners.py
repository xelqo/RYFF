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
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "sandbox" / "analyse.py"
REMOTE = "/home/daytona/loopstack"
OUTPUT_KEYS = ("sample", "loop")  # result keys that name files the script wrote
EXEC_TIMEOUT = 30  # seconds for one command in the sandbox
RUN_TIMEOUT = 20  # seconds for a whole take (upload + analyse + download); normal is ~2 s
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
        self._stopping = False
        self._pool = ThreadPoolExecutor(max_workers=2)

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
            self._bootstrap()
            self.status = "ready"
            log.info("Daytona sandbox ready: %s", getattr(self.sandbox, "id", "?"))
            threading.Thread(target=self._keepalive, daemon=True).start()
        except Exception as e:  # keep the server up; /api/health shows the error
            log.exception("Daytona startup failed")
            self.status, self.error = "error", f"{type(e).__name__}: {e}"
        finally:
            self._ready.set()

    def _create(self):
        try:
            from daytona import CreateSandboxFromSnapshotParams

            # auto_stop_interval=0: never auto-stop while the server runs (it's deleted on shutdown)
            return self.daytona.create(CreateSandboxFromSnapshotParams(language="python", auto_stop_interval=0))
        except (ImportError, TypeError) as e:
            log.warning("Using default sandbox params (%s)", e)
            return self.daytona.create()

    def _bootstrap(self):
        self._exec(f"mkdir -p {REMOTE}/jobs", timeout=30)
        self.sandbox.fs.upload_file(SCRIPT.read_bytes(), f"{REMOTE}/analyse.py")
        r = self._exec('python3 -c "import numpy"', timeout=60)
        if getattr(r, "exit_code", 1) != 0:
            r = self._exec("python3 -m pip install -q numpy", timeout=300)
            if getattr(r, "exit_code", 1) != 0:
                raise AnalysisError(f"numpy install failed: {(getattr(r, 'result', '') or '')[-300:]}")

    def _exec(self, cmd: str, timeout: int = EXEC_TIMEOUT):
        return self.sandbox.process.exec(cmd, timeout=timeout)

    def _wake_if_stopped(self):
        """If Daytona stopped the sandbox (idle), start it again before using it."""
        try:
            refresh = getattr(self.sandbox, "refresh_data", None)
            if refresh:
                refresh()
            state = str(getattr(self.sandbox, "state", "")).lower()
            if state and "started" not in state and "start" in dir(self.sandbox):
                log.warning("Sandbox state is %s; starting it", state)
                self.sandbox.start()
                self._bootstrap()
        except Exception as e:
            log.warning("Couldn't check sandbox state (%s)", e)

    def _recover(self):
        log.warning("Recovering the Daytona sandbox")
        try:
            self.sandbox.start()
        except Exception as e:
            log.warning("start() failed (%s); creating a new sandbox", e)
            self.sandbox = self._create()
        self._bootstrap()
        log.info("Daytona sandbox recovered: %s", getattr(self.sandbox, "id", "?"))

    def _keepalive(self):
        while not self._stopping:
            time.sleep(240)
            if self._stopping or self.status != "ready":
                continue
            if not self._lock.acquire(timeout=5):
                continue  # a take is running, which counts as activity
            try:
                self._exec("true", timeout=20)
            except Exception as e:
                log.warning("Keepalive failed (%s)", e)
                try:
                    self._recover()
                except Exception:
                    log.exception("Sandbox recovery failed")
            finally:
                self._lock.release()

    def _run_once(self, wav: bytes, args: list[str]) -> tuple[dict, dict]:
        job = f"{REMOTE}/jobs/{uuid.uuid4().hex[:8]}"
        self._exec(f"mkdir -p {job}", timeout=20)
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
        return result, files

    def _timed(self, fn, *args, timeout: float):
        fut = self._pool.submit(fn, *args)
        try:
            return fut.result(timeout=timeout)
        except FutureTimeout:
            raise AnalysisError(f"Daytona didn't answer within {int(timeout)} s. Try the take again.")

    def run(self, wav: bytes, args: list[str]) -> tuple[dict, dict]:
        if not self._ready.wait(timeout=60):
            raise AnalysisError("The Daytona sandbox is still starting. Try again in a few seconds.")
        if self.status != "ready":
            raise AnalysisError(f"Daytona sandbox unavailable: {self.error}")
        if not self._lock.acquire(timeout=30):
            raise AnalysisError("Daytona is still busy with the previous take. Try again in a moment.")
        t0 = time.time()
        try:
            self._timed(self._wake_if_stopped, timeout=25)
            try:
                result, files = self._timed(self._run_once, wav, args, timeout=RUN_TIMEOUT)
            except AnalysisError:
                raise
            except Exception as e:
                log.warning("Daytona run failed (%s: %s); recovering and retrying once", type(e).__name__, e)
                try:
                    self._timed(self._recover, timeout=30)
                    result, files = self._timed(self._run_once, wav, args, timeout=RUN_TIMEOUT)
                except AnalysisError:
                    raise
                except Exception as e2:
                    raise AnalysisError(f"Daytona sandbox error: {type(e2).__name__}: {e2}") from e2
        finally:
            self._lock.release()
        result["runner"] = self.name
        result["seconds_in_daytona"] = round(time.time() - t0, 2)
        log.info("Daytona analysis took %.2f s", time.time() - t0)
        return result, files

    def stop(self):
        self._stopping = True
        if self.sandbox is None:
            return
        try:
            self.sandbox.delete()
        except Exception:
            try:
                self.daytona.delete(self.sandbox)
            except Exception:
                log.warning("Couldn't delete the sandbox. Delete it at app.daytona.io if it's still running.")


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
