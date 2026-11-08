# Loopstack: notes for Claude Code

Hackathon project: pick a vibe, get a beat, then add your own sounds (claps → drums, hums → melody/bass, anything
else → texture) at any time. Must use **ElevenLabs** and **Daytona** in essential ways. Read README.md, then
docs/ARCHITECTURE.md, docs/APIS.md and docs/TEAM.md before writing code.

- Original code only: don't copy from other repos (e.g. our earlier "pulse" project). Ideas are fine.
- The vibe is set once per session (tempo, key, groove, instruments). No vibe changing, no tempo detection, and the
  user's clap rhythm is NOT followed; we use the clap's sound only.
- Frontend: React + Vite + TypeScript + Tone.js. Backend: Python FastAPI. Sandbox code lives in `sandbox/`.
- The browser owns timing/playback. The server returns Session/Vibe/Part JSON + sample URLs.
- API keys stay in `.env` on the backend, never in the frontend.
- Reuse ONE Daytona sandbox per session. Cache ElevenLabs results by prompt.
- Follow docs/PLAN.md milestones; keep the app demoable after each one.
