# Team split for the rest of today (submit by 4:15)

The code is in place (shipped build, 2:00 PM). Everyone tests and polishes their own folder. Detailed briefs for
AI coding agents: [ROLES.md](ROLES.md).

| Who | Owns | First 20 minutes |
|---|---|---|
| **Lucas**: frontend | `frontend/` | `npm install && npm run dev`, set a vibe with the manual buttons, check the beat, the count-in and that hums land on the beat (tune `LATENCY_NUDGE_MS` in `recorder.ts`) |
| **Derik**: analysis + Daytona | `sandbox/`, `backend/runners.py` | Put `DAYTONA_API_KEY` in `.env`, start the backend, wait for **daytona: ready** in the top bar. Record claps and hums and check the results |
| **Alex**: backend + ElevenLabs, merges | `backend/` (except the files below) | `ELEVENLABS_API_KEY` in `.env`, run `python prewarm.py`, test every endpoint, keep `main` running |
| **Avi**: sound design, agent, demo | `backend/vibes.py`, `docs/` | Create the agent from [AGENT.md](AGENT.md), put its ID in `frontend/.env`, listen to every preset kit and re-prompt bad sounds in `vibes.py`, rehearse the Loom |

## Timeline
| When | What |
|---|---|
| now → 2:45 | Everyone gets their part working end to end on one laptop |
| 2:45 → 3:30 | Full voice runs: vibe → clap → hum → vibe change → export. Fix whatever breaks |
| 3:30 → 3:50 | Feature freeze. Rehearse the script twice, including the interruption |
| 3:50 → 4:10 | Record the Loom (live, one take, under 2:00), push, submit repo link + Loom + track/user/finish line |

## Rules
- `main` always runs. Small commits, pull before you push; Alex merges.
- Never paste API keys into the frontend or a commit.
- Stuck for more than 15 minutes? Say so in the group chat.
