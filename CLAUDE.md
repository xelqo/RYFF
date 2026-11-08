# Loopstack: notes for Claude Code

Hackathon project: talk to an ElevenLabs voice agent ("the producer"), pick a vibe, get a beat, then add your own
sounds (claps → drums, hums → melody/bass, anything else → texture). Must use **ElevenLabs** (agent voice is
required) and **Daytona** in essential ways. Read README.md, docs/AGENT.md, docs/ARCHITECTURE.md and docs/ROLES.md first.

- Original code only: don't copy from other repos (e.g. our earlier "pulse" project). Ideas are fine.
- The vibe sets tempo, key, groove and instruments. Changing the vibe keeps parts (hums are re-keyed).
  The user's clap rhythm is NOT followed; we use the clap's sound only.
- Frontend: React + Vite + TypeScript + Tone.js + @elevenlabs/react. Backend: Python FastAPI. Sandbox: `sandbox/`.
- Agent tool names/params in `frontend/src/App.tsx` must match `docs/AGENT.md` and the ElevenLabs dashboard.
- The browser owns playback and export. The server returns Session JSON + sample URLs.
- API keys stay in the root `.env`, never in the frontend.
- `sandbox/analyse.py` must stay numpy-only and print one JSON line; it runs inside Daytona.
