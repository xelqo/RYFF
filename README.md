# RYFF

**Hum, clap and talk your way to an original song.** RYFF is a producer that needs no music skills: hum a few notes
to set the key, say the vibe out loud, then click to add drums or a backing track from your own sounds. Every sound
you add makes a new version of the song, and **your real clap is mixed into the track**.

Built at the SDX Hackathon with **ElevenLabs** (music, the producer's voice, speech-to-text) and **Daytona** (all
audio analysis and mixing, in a sandbox).

- **Track:** Open
- **User:** anyone with a beat or tune in their head and no production skills; creators who need original, copyright-safe music
- **Finish line:** a downloaded song that contains your own sound

## How a session goes
1. **Enter.** Click "RYFF." The producer speaks one short prompt per step and never chats.
2. **Set the key (optional).** Click *Hum the key* and hum a few notes. Daytona detects the key (e.g. D minor);
   every version is generated in it.
3. **Say the vibe.** Click *Say your vibe* and say anything ("chill lo-fi for late-night studying", "dreamy synthwave").
   *Type* also works.
4. **Version 1** plays: chords and atmosphere only, so every sound you add is obvious.
5. **Add drums**: click and clap, tap or drop something (or *Upload* a sound). RYFF regenerates the song with
   drums shaped by how you clapped, then layers **your actual clap** on the beat.
6. **Add backing track**: click and hum (or upload). Your hum's feel (high/low, rising/falling, smooth/choppy) shapes
   the melody and bassline.
7. **Versions** (v1 start, v2 drums, v3 backing…) sit in the dock. Click any one to play it; new sounds build on the
   one that's playing. The orb plays and pauses. **Download** saves the current version.

Recording always starts with a click. The producer's voice only asks for the next input.

## How it works
```
 browser (RYFF UI)                      backend (FastAPI)                         services
 ─────────────────                      ─────────────────                         ────────
 mic → raw PCM WAV ──── POST /key ────► Daytona: analyse.py (YIN pitch) ──► key (Krumhansl)
 spoken vibe ────────── POST /transcribe ───────────────────────────────► ElevenLabs Speech-to-Text
 prompts ◄───────────── POST /speak ────────────────────────────────────► ElevenLabs Text-to-Speech (cached)
 vibe ───────────────── POST /sessions ─► composition plan ─────────────► ElevenLabs Music → v1
 clap / hum / upload ── POST /parts ───► Daytona: analyse.py
                                           drums: onsets → cleanest hit, kick/snare/hat, busy/punchy/bright
                                           hum:   pitch → register, contour, smoothness
                                         traits → words → plan (+ first 3 s conditioned on the last version)
                                                                        ───► ElevenLabs Music → new version
                                         Daytona: mix.py (tempo + beat → your real hit on the beat) → -14 LUFS
 polls GET /sessions/{id} ◄── new version ready → plays it
```
- **ElevenLabs Music** (`music_v2`, composition plans): each version is 40 s by default (20/40/60/90 s with the Length button), generated in a few seconds. Layers you haven't
  added are banned (no drums/bass/melody in v1). Earlier layers are named as continuing so new ones don't wash them out.
- **Daytona**: one warm sandbox (reused across restarts) runs `sandbox/analyse.py` and `sandbox/mix.py`.
  User audio is never processed on the web server.
- Details: [backend/README.md](backend/README.md) (API + internals) · [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) (demo) ·
  [docs/APIS.md](docs/APIS.md) (ElevenLabs/Daytona notes + test results). Other files in `docs/` are planning notes
  from earlier in the day.

## Repo layout
```
frontend/          React + Vite + TypeScript
  src/ryff/        the RYFF interface (Avi's design): orb, shader visuals, controls, spoken prompts
  src/ClassicApp   previous UI with the conversational ElevenLabs agent (fallback at /?classic)
backend/           FastAPI: sessions, versions, composition plans, ElevenLabs calls, Daytona orchestration
  create_agent.py  creates the conversational agent used by /?classic
sandbox/           runs INSIDE Daytona: analyse.py (hits, pitch, key notes), mix.py (beat detection + mixing)
spikes/            Music API experiments
docs/              demo script, API notes, planning docs
Dockerfile         backend container (Render / Railway / Fly.io)
```

## Run locally
```bash
cp .env.example .env              # ELEVENLABS_API_KEY, DAYTONA_API_KEY (agent ID optional, for /?classic)
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --port 8000          # needs ffmpeg on PATH
cd ../frontend && npm install && npm run dev    # http://localhost:5173
```
Check `curl localhost:8000/health` → `"mode": "daytona"`. Use headphones or a wired mic. Chrome is the safest browser.

## Deploy
**Frontend → Vercel.** New Project → import this repo (keep the root directory as the repo root). The root
`vercel.json` defines one public service, `frontend` (Vite, in `frontend/`), served at `/`. The backend is deliberately
not a Vercel service, so no bindings are needed: the browser calls the backend directly. Add the environment
variable **`VITE_API_BASE`** = your backend's HTTPS URL (Production + Preview), then deploy. The frontend holds **no secrets**.

**Backend → a long-running host, not Vercel.** It keeps sessions in memory, generates in the background, serves
audio files from disk, needs ffmpeg and a warm Daytona connection; Vercel's serverless functions can't do that.
- **Render / Railway / Fly.io:** deploy the repo with the root `Dockerfile`, **one instance**, and set the env vars
  `ELEVENLABS_API_KEY`, `DAYTONA_API_KEY` (optional: `DAYTONA_SANDBOX_ID`, `PRODUCER_VOICE_ID`). Use its HTTPS URL as `VITE_API_BASE`.
- **Quickest for a demo:** run the backend on a laptop and expose it with `cloudflared tunnel --url http://localhost:8000`
  (or ngrok), then use that HTTPS URL as `VITE_API_BASE`.

**Keys can change any time:** they only live in the backend's environment. Update them on the host and restart; no
code changes or frontend redeploy needed. Changing the backend URL means updating `VITE_API_BASE` and redeploying the
frontend (Vite bakes it in at build time).

**Before sharing a public link:** the API has no login, so anyone with the URL spends your ElevenLabs credits.
Keep the link private, or add a simple access check.

## Team
Alex (backend + ElevenLabs) · Derik (Daytona analysis + mixing) · Lucas (frontend + recording) · Avi (RYFF design + sound design)
