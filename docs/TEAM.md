# Team split (4 people)

Names, owned folders and copy-paste agent briefs: **[ROLES.md](ROLES.md)**.

Each person owns one folder, so everyone can build in parallel and merge conflicts stay rare.

## Roles
**1. Frontend: Lucas** (`frontend/`)
Vibe picker, guided "add a sound" prompts, recorder (auto-pauses playback), looping player + audio visualiser,
version history, loading/"producing…" state, and the voice agent wiring (`@elevenlabs/react` client tools). Starts against **mock session JSON + a few sample mp3s**
(`frontend/mock/`), so it doesn't wait on the backend. Owns how it looks and feels on stage.

**2. Analysis + Daytona: Derik** (`sandbox/`)
`analyse.py` (traits from takes, librosa) and `mix.py` (loudness, fades), developed locally first. Then the Daytona
snapshot, a per-session sandbox, and upload/run/download from the backend.

**3. Backend + ElevenLabs: Alex** (`backend/`)
Leads **step 0** (the Music API tests). FastAPI endpoints, session + version state, the composition-plan builder
(vibe + parts → chunks + conditioning_ref), ElevenLabs calls, the agent token endpoint, file serving. **Runs integration and merges PRs.**

**4. Sound/prompt design + voice agent + demo: Avi** (`backend/vibes.py`, `backend/words.py`, `docs/`, the agent in the ElevenLabs dashboard)
Creates and tunes the voice agent (voice, prompt, tools; see AGENT.md). Writes the vibe presets and the traits → words table, then tunes them **by ear** until each preset sounds great and
each added part is clearly audible. That decides how good the demo sounds. Records test claps/hums, tests the app
end to end. Late: demo script, slides, Devpost, backup video, rehearsal. Floater when someone is stuck.

## Timeline (today)
| When | What |
|---|---|
| Now | Alex: Music test · Avi: agent in the dashboard, presets · Lucas: player, recorder, agent wiring on mocks · Derik: `analyse.py` locally |
| 2:30 | Go or no-go on the Music API |
| 3:00 | Voice sets the vibe and a song plays |
| 3:45 | Penny through Daytona makes a new version |
| 4:15 | Export works, record the Loom |
| Until 5:00 | Feature freeze, curveballs, demo room test |

## Rules
- `main` always runs. Use personal branches and small, frequent PRs; Alex merges.
- Changing the shared JSON shape needs a heads-up in the group chat first.
- 5-minute standup every ~3 h: what works, what's blocked, what gets cut.
- Stuck for more than 45 min? Grab Avi.
