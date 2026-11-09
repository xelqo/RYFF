# Loopstack (working name)

**Drop anything, tell it what to make.** Loopstack is a voice-directed music producer. Tell the producer a vibe
and a beat plays. It asks for more: drop a penny or clap and the song gets drums built around your real hit; hum and
it gets a melody shaped like your hum. Every sound you add makes a new, fuller version of the song.

## Track, user, finish line
- **Track:** Open
- **User:** anyone with a beat or tune in their head and no production skills
- **Finish line:** an exported song containing their own sound, directed by voice

Built for the SDX Hackathon with **ElevenLabs** (a voice agent "producer" that runs the session + **Music**, which
generates every version of the song) and **Daytona** (sandboxed audio analysis + mixing).

## The 10-second pitch
You don't need to play an instrument or know music words. Make a noise, and Loopstack turns how it *feels* (fast,
punchy, soaring, low and smooth) into a part of your song.

## How a session goes
A voice agent, **the producer**, talks you through it (the on-screen buttons do the same things):
1. **Say a vibe** to the producer: "chill lo-fi", "dark trap", "summer house". Presets and on-screen buttons are the
   backup. You can change it later by asking.
2. **Version 1 plays:** a beat in that vibe.
3. **The producer asks for a sound**, e.g. "Want drums? Drop a penny, clap or tap something after the beep." (Every
   step can be skipped.)
4. **Press record → the music pauses.** Recording only ever happens with no music playing.
5. We analyse your sound for rough traits, describe it in words, and **regenerate the whole song** with the new
   part, building on the previous version.
6. **The new version plays.** Next prompt: "Hum a melody", "Hum something low for bass", "Any other sound?"
7. Step back to any earlier version, and download the one you like.

Your sound does two jobs. A hit like a penny or clap is mixed into the track as the real sample, so you can hear
your own sound. Its traits (busy vs sparse, punchy vs soft, high vs low, rising vs falling) steer the generated part.

## How it works
```
 you (voice) ◄──► ElevenLabs Agent "the producer"
                    │ client tools: set_vibe · record_sound · play_version · skip_part · download_song
                    ▼
 vibe text ──────────────────────────────► ElevenLabs Music (v2) ──► song v1
                                                                        │
 [paused] mic take ─► Daytona sandbox                                   │ conditioning_ref
                      analyse.py ─► traits ─► words ─► composition plan ─► ElevenLabs Music ─► new song
                                                                                                  │
                      mix.py ◄────────────────────────────────────────────────────────────────────┘
                        detects beats, places your real hit on them, normalises ─► song v2, v3 …
```
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API notes: [docs/APIS.md](docs/APIS.md) ·
Voice agent: [docs/AGENT.md](docs/AGENT.md) · Plan: [docs/PLAN.md](docs/PLAN.md) · Team: [docs/TEAM.md](docs/TEAM.md) · Demo: [docs/DEMO.md](docs/DEMO.md) ·
Roles: [docs/ROLES.md](docs/ROLES.md)

## Repo layout (planned)
```
frontend/   React + Vite: ElevenLabs agent session + client tools, vibe picker, guided "add a sound" flow, recorder,
            player + visualiser, version history
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
cp .env.example .env          # fill in ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID and DAYTONA_API_KEY
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn main:app --reload --port 8000
cd frontend && npm install && npm run dev
```
Demo from a laptop on localhost, where the mic works without HTTPS. Use headphones.
