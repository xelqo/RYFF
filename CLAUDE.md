# Loopstack: notes for Claude Code

Hackathon project: a loop pedal that turns claps, hums and other sounds into layered music. Must use **ElevenLabs** and
**Daytona** in essential ways. Read README.md, then docs/ARCHITECTURE.md and docs/APIS.md before writing code.

- Original code only: don't copy from other repos (e.g. our earlier "pulse" project). Ideas are fine.
- Frontend: React + Vite + TypeScript + Tone.js. Backend: Python FastAPI. Sandbox code lives in `sandbox/`.
- The browser owns timing/playback (Tone.js Transport). The server only returns layer JSON + sample URLs.
- Never put API keys in the frontend; they stay in `.env` on the backend.
- Reuse ONE Daytona sandbox per session. Cache ElevenLabs results by prompt.
- Follow docs/PLAN.md milestones; keep the app demoable after each one.
