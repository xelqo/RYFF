# Loopstack (working name)

**Pick a vibe, then build a song out of your own sounds.** Type "chill lo-fi" and you get a beat at the right tempo.
Clap and your clap becomes the snare. Hum and your tune becomes the melody. Add parts whenever you want, in any
order. Nothing is required up front except the vibe.

Built for <hackathon name> with **ElevenLabs** (instrument sounds + backing track) and **Daytona** (sandboxed audio
analysis).

## The 10-second pitch
Everyone has a beat or a tune in their head and no way to get it out. Pick a vibe, make some noise, and Loopstack
turns it into a real track that's still recognisably *yours*: your clap, your melody, in the style you asked for.

## How a session goes
1. **Choose a vibe** (text or preset): "chill lo-fi", "dark trap", "summer house".
   The vibe sets the **tempo, key, drum pattern style and instruments** for the whole song. It's fixed for the session.
2. **A beat starts** right away from the vibe alone.
3. **Add a sound, any time.** Pause or keep playing, record, and it joins the song on the next loop:
   - **clap / tap / beatbox / any hit** → we use the *sound itself* as a drum in the vibe's pattern
     (rhythm stays loose; the vibe decides the groove)
   - **hum / whistle / "da da da"** → becomes the melody (or bassline), snapped to the vibe's tempo and key and played
     on the vibe's instrument
   - **any other sound** (keys jingling, rain, "shhh") → a texture loop in the background
4. Mute, redo or delete any part. Export the song.

## How it works
```
 vibe text ─► vibe profile: bpm, key, drum style, instruments   (fixed for the session)
                   │
                   ├─► ElevenLabs Sound Effects → the vibe's drum kit + instrument notes
                   └─► (optional) ElevenLabs Music → backing track at that bpm + key

 mic take ─► backend ─► Daytona sandbox: what is this sound?
                          hit     → cut out the cleanest hit as a sample
                          hum     → pitch → notes, snapped to the vibe's grid + key
                          texture → trimmed, crossfaded loop
                   │
                   ▼
 browser plays everything on one loop (Tone.js transport at the vibe's bpm)
```
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API notes: [docs/APIS.md](docs/APIS.md) ·
Build plan: [docs/PLAN.md](docs/PLAN.md) · Team split: [docs/TEAM.md](docs/TEAM.md) · Demo: [docs/DEMO.md](docs/DEMO.md)

## Repo layout (planned)
```
frontend/   React + Vite + Tone.js: vibe picker, recorder, loop transport, part cards
backend/    FastAPI: session state, vibe profiles, ElevenLabs calls, Daytona orchestration
sandbox/    code that runs INSIDE the Daytona sandbox (analyse.py) + its requirements
spikes/     throwaway tests (see PLAN step 0)
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
See [docs/TEAM.md](docs/TEAM.md).
