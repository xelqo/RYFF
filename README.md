# Loopstack (working name)

**Pick a vibe, then grow a song with your own sounds.** Type "chill lo-fi" and a beat plays. The app asks for more:
clap something and the song gets drums that feel like your clap; hum and it gets a melody shaped like your hum.
Every sound you add makes a new, fuller version of the song.

Built for <hackathon name> with **ElevenLabs** (a voice agent "producer" that runs the session + **Music**, which
generates every version of the song) and **Daytona** (sandboxed audio analysis + mixing).

## The 10-second pitch
You don't need to play an instrument or know music words. Make a noise, and Loopstack turns how it *feels* (fast,
punchy, soaring, low and smooth) into a part of your song.

## How a session goes
A voice agent, **the producer**, talks you through it (the on-screen buttons do the same things):
1. **Choose a vibe** (text or preset): "chill lo-fi", "dark trap", "summer house". It's fixed for the session.
2. **Version 1 plays:** a beat in that vibe.
3. **The producer asks for a sound**, e.g. "Want drums? Clap or tap something after the beep." (Every step can be skipped.)
4. **Press record → the music pauses.** Recording only ever happens with no music playing.
5. We analyse your sound for rough traits, describe it in words, and **regenerate the whole song** with the new
   part, building on the previous version.
6. **The new version plays.** Next prompt: "Hum a melody", "Hum something low for bass", "Any other sound?"
7. Step back to any earlier version, and download the one you like.

Your sound is **loosely** related to the result: it steers the part (busy vs sparse, punchy vs soft, high vs low,
rising vs falling). The result isn't a copy of what you did.

## How it works
```
 vibe text ──────────────────────────────► ElevenLabs Music (v2) ──► song v1
                                                                        │
 [paused] mic take ─► Daytona sandbox ─► traits                         │ conditioning_ref
                      (busy, punchy,      │                             ▼
                       pitch, contour)    └─► words ─► composition plan ─► ElevenLabs Music ─► song v2, v3 …
```
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API notes: [docs/APIS.md](docs/APIS.md) ·
Voice agent: [docs/AGENT.md] · Plan: [docs/PLAN.md](docs/PLAN.md) · Team: [docs/TEAM.md](docs/TEAM.md) · Demo: [docs/DEMO.md](docs/DEMO.md)

## Repo layout (planned)
```
frontend/   React + Vite: vibe picker, guided "add a sound" flow, recorder, player + visualiser, version history
backend/    FastAPI: sessions, traits → words, composition plans, ElevenLabs Music, Daytona orchestration
sandbox/    code that runs INSIDE the Daytona sandbox (analyse.py, mix.py) + requirements
spikes/     throwaway tests (see PLAN step 0)
docs/
```

## Team
Lucas (frontend) · Derik (analysis + Daytona) · Alex (backend + ElevenLabs) · Avi (sound design + demo).
Roles and agent briefs: [docs/ROLES.md](docs/ROLES.md).

## Setup
```bash
cp .env.example .env          # fill in ELEVENLABS_API_KEY and DAYTONA_API_KEY
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn main:app --reload --port 8000
cd frontend && npm install && npm run dev
```
The mic only works on `localhost` or HTTPS, so use a tunnel (ngrok / cloudflared) for phones.
