# Loopstack: notes for Claude Code

Hackathon project: pick a vibe and get a song; the app then asks for sounds (clap → drums, hum → melody/bass,
anything → texture). Each sound, recorded while the music is PAUSED, is analysed for rough traits, turned into
words, and the whole song is regenerated with ElevenLabs Music, building on the previous version. Must use
**ElevenLabs** and **Daytona** in essential ways. Read README.md, docs/ARCHITECTURE.md, docs/APIS.md and docs/TEAM.md
first.

**Find your role in docs/ROLES.md** (Lucas = frontend, Derik = analysis + Daytona, Alex = backend + ElevenLabs,
Avi = sound design + demo). Ask the user who they are if unsure, and stay inside that person's folders.

- Original code only: don't copy from other repos (e.g. our earlier "pulse" project). Ideas are fine.
- The vibe is set once per session. User sounds are LOOSE inspiration (traits → words), never exact notes or rhythm.
- No custom audio engine/layering/tempo sync. Every version is one ElevenLabs Music track.
- Recording only while playback is paused.
- Frontend: React + Vite + TypeScript. Backend: Python FastAPI. Sandbox code (librosa/ffmpeg) lives in `sandbox/`.
- API keys stay in `.env` on the backend, never in the frontend.
- Reuse ONE Daytona sandbox per session.
- Follow docs/PLAN.md milestones; keep the app demoable after each one.
