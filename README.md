# Loopstack

**Talk to a producer, make some noise, get a track.** Tell the voice agent a vibe ("chill lo-fi") and a beat
starts. Clap and your clap becomes the snare. Hum and your tune becomes the melody, in key and on the beat.
Change your mind ("actually, make it trap") and everything follows. Say "I'm done" and you get a WAV.

Built at the **SDx Hackathon (Nov 8, 2026)** with **ElevenLabs** (the voice agent, every drum and instrument sound,
the backing track) and **Daytona** (all audio analysis runs in a sandbox).

## SDx Hackathon submission
- **Track:** Open
- **User:** a creator who needs an original, copyright-safe intro beat for their videos
- **Finish line:** done means an exported 15-second track, built from their own sounds, ready to drop into an edit

## How a session goes
1. **Say a vibe.** The producer calls `set_vibe`. The vibe sets tempo, key, groove, chords and instruments, and a
   beat starts right away (ElevenLabs Sound Effects make the kit).
2. **Add your sounds, any time, in any order.** The producer tells you what to do, then records:
   - **clap / tap / beatbox** → the cleanest hit is cut out and becomes a drum in the vibe's pattern
   - **hum** → pitch-tracked into notes, snapped to the key and the 16th grid, played on the vibe's instrument
   - **any other sound** → a seamless background loop
3. **Change anything by voice:** move a sound to another drum, mute, remove, switch the whole vibe, or add an
   ElevenLabs Music backing track.
4. **Export** → a 15-second WAV to download. That's the finish line.

## The voice agent (ElevenLabs)
You don't click through Loopstack, you talk to it. The agent runs the app through **client tools** in the browser
(setup: [docs/AGENT.md](docs/AGENT.md)).

| You say | Agent tool | Backend |
|---|---|---|
| "Chill lo-fi" / "actually, make it trap" | `set_vibe(vibe)` | `POST /api/sessions`, `POST /api/sessions/{id}/vibe` |
| "Let me clap something" | `record_part(kind)` | `POST /api/sessions/{id}/parts` → Daytona |
| "Make my clap the kick" | `set_part_slot(part, slot)` | `PATCH /api/sessions/{id}/parts/{pid}` |
| "Mute the hum" | `mute_part(part, muted)` | `PATCH /api/sessions/{id}/parts/{pid}` |
| "Lose the keys" | `remove_part(part)` | `DELETE /api/sessions/{id}/parts/{pid}` |
| "Fill it out" | `add_backing(style)` | `POST /api/sessions/{id}/backing` (doesn't block the conversation) |
| "I'm done" | `export_song()` | rendered in the browser (`Tone.Offline`) |

While a part records, the app mutes the agent's mic so it doesn't hear the clap as an interruption.

## How it works
```
 voice ─► ElevenLabs agent ─► client tools (browser)
                                  │
 vibe ──► backend: vibe profile (bpm, key, groove, chords) ─► ElevenLabs Sound Effects: kit + instrument notes
                                  │                         └► ElevenLabs Music: optional backing track
 mic take ─► backend ─► Daytona sandbox: python3 analyse.py
                          hit     → onsets → cleanest hit → sample + which drum it sounds like
                          hum     → YIN pitch tracking → notes snapped to key + grid
                          texture → trimmed, crossfaded loop
                                  │
 browser (Tone.js) plays everything on one clock and renders the export
```
More: [docs/AGENT.md](docs/AGENT.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/APIS.md](docs/APIS.md) · [docs/PLAN.md](docs/PLAN.md) ·
[docs/TEAM.md](docs/TEAM.md) · [docs/ROLES.md](docs/ROLES.md) · [docs/DEMO.md](docs/DEMO.md)

## Run it
```bash
cp .env.example .env                      # ELEVENLABS_API_KEY, DAYTONA_API_KEY
cp frontend/.env.example frontend/.env    # VITE_ELEVENLABS_AGENT_ID (see docs/AGENT.md)

# backend (terminal 1)
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn main:app --reload --port 8000     # boots the Daytona sandbox in the background
python prewarm.py                         # optional: pre-generate every preset kit before the demo

# frontend (terminal 2)
cd frontend && npm install && npm run dev # open http://localhost:5173
```
- Use **headphones**: the beat plays while you hum, and speakers would leak into the mic.
- The pill in the top bar shows the sandbox: `daytona: ready` means takes are analysed in Daytona.
- No agent yet? The **manual controls** do everything the agent does, so you can build and test without it.
- Hits landing early or late? Adjust `LATENCY_NUDGE_MS` in `frontend/src/recorder.ts`.

## Repo layout
```
frontend/   React + Vite + Tone.js: agent tools (App.tsx), audio engine (engine.ts), mic capture (recorder.ts)
backend/    FastAPI: vibes.py (profiles), eleven.py (ElevenLabs), runners.py (Daytona), main.py (routes)
sandbox/    analyse.py: runs INSIDE the Daytona sandbox (numpy only)
docs/       AGENT.md (agent setup), ARCHITECTURE, APIS, PLAN, TEAM, ROLES, DEMO
```

## Team
Lucas (frontend) · Derik (analysis + Daytona) · Alex (backend + ElevenLabs) · Avi (sound design, agent config, demo).
Who does what: [docs/TEAM.md](docs/TEAM.md) and [docs/ROLES.md](docs/ROLES.md).
