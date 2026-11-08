# Loopstack (working name)

**Make a song out of the sounds around you.** Clap a beat, hum a melody, go "tss" for a hi-hat, and each sound
becomes a looping layer in a real track. Add a layer whenever you want, redo it, mute it, or tell it what to
become ("make the clap an 808", "turn my hum into a cello").

Built for <hackathon name> with **ElevenLabs** (instrument sounds + backing track) and **Daytona** (sandboxed
audio analysis).

## The 10-second pitch
Everyone has a beat or a tune in their head and no way to get it out. Loopstack is a loop pedal that turns your
voice and hands into instruments: you perform, it figures out the rhythm and the notes, and ElevenLabs gives
them a real sound.

## How it works
```
 mic ─► record a layer (2 or 4 bars, count-in, metronome)
          │
          ▼
   backend (FastAPI) ──► Daytona sandbox: analyse the take
          │                 clap/tap  → onsets → 16th-note pattern
          │                 hum       → pitch → notes (snapped to key)
          │                 anything  → keep as a texture loop
          ▼
   ElevenLabs
     Sound Effects → the instrument sound for that layer ("punchy 808 kick", "warm cello note")
     Music         → optional full backing track at the session's BPM + key
          │
          ▼
 browser plays every layer in sync on one loop (Tone.js transport)
```
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API notes: [docs/APIS.md](docs/APIS.md) ·
Build plan: [docs/PLAN.md](docs/PLAN.md) · Demo script: [docs/DEMO.md](docs/DEMO.md)

## Layer types
| You do | We hear | It becomes |
|---|---|---|
| clap / tap / beatbox | onsets → rhythm pattern | drum layer (your own sound, or an ElevenLabs-generated kick/snare/hat) |
| hum / whistle / sing "da da" | pitch → notes in the session key | melody or bass layer played on a generated instrument |
| any sound (rain, keys, "shhh") | kept as audio | looping texture, optionally re-imagined by ElevenLabs |
| type "lo-fi, chill, add drums" | text | ElevenLabs Music backing track that fits the BPM + key |

## Repo layout (planned)
```
frontend/   React + Vite + Tone.js: recorder, loop transport, layer cards, text box
backend/    FastAPI: session state, ElevenLabs calls, Daytona orchestration
sandbox/    code that runs INSIDE the Daytona sandbox (analyse.py) + its requirements
spikes/     throwaway tests (hum → notes → instrument), see PLAN step 0
docs/
```

## Setup
```bash
cp .env.example .env          # fill in ELEVENLABS_API_KEY and DAYTONA_API_KEY
# backend
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# frontend
cd frontend && npm install && npm run dev
```
The mic only works on `localhost` or HTTPS, so use a tunnel (ngrok / cloudflared) for phones.

## Team
| Who | Owns |
|---|---|
| | frontend + audio engine (recording, loop sync, UI) |
| | backend + Daytona sandbox (analysis pipeline) |
| | ElevenLabs sound design (prompts, instrument presets, backing track) |
| | demo, pitch, Devpost, video |
