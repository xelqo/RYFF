# Team split (4 people)

Each person owns one folder, so everyone can build in parallel and merge conflicts stay rare.

## Roles
**1. Frontend / audio engine** (`frontend/`)
Vibe picker, beat playback (Tone.js transport, samplers, swing), recorder, part cards (mute/delete/redo/slot),
visuals. Starts against **fake session/part JSON** (`frontend/mock/`), so it doesn't wait on the backend.

**2. Analysis + Daytona** (`sandbox/`)
Leads **step 0**. Writes `analyse.py` (hit cutting + slot guess, hum → notes snapped to key/grid, texture loops,
auto-classify), developed locally first. Then the Daytona snapshot and the run-in-sandbox code. Give this to the
strongest Python/audio person, because it's the riskiest part.

**3. Backend + ElevenLabs** (`backend/`)
FastAPI endpoints, session state, vibe profiles (the genre table + free-text mapping), ElevenLabs SFX calls with
caching, optional Music backing track, export, file serving. **Runs integration and merges PRs.**

**4. Sound design + demo** (`backend/vibes/` presets + `docs/`)
Early: writes and tests the ElevenLabs prompts and drum patterns for each preset vibe until every kit sounds good.
This is what makes the demo sound professional. Records test hums/claps for the team and tests the app as it comes
together. Late: demo script, slides, Devpost, backup video, rehearsal. Also the floater when someone is stuck.

## Timeline (assuming ~24 h; scale to the event)
| When | What |
|---|---|
| Hour 0–1, together | Agree the Session / Vibe / Part JSON in ARCHITECTURE.md, write the mock files, create the folder skeleton |
| Hour 1–3 | 2: hum + clap tests · 4: kit prompts + patterns for 2 vibes · 1: beat playback from mock JSON · 3: API skeleton + ElevenLabs client |
| ~Hour 3, check-in | Go / no-go on hum and clap quality → simplify if needed |
| ~Hour 8 | Milestone 1 merged: pick a vibe and hear the beat |
| ~Hour 14 | Milestone 2: add claps and hums via Daytona. 4 records the first backup video |
| Last 5–6 h | Feature freeze: polish, bug fixes, rehearse |

## Rules
- `main` always runs. Use personal branches and small, frequent PRs; person 3 merges.
- Changing the shared JSON shape needs a heads-up in the group chat first.
- 5-minute standup every ~3 h: what works, what's blocked, what gets cut.
- Stuck for more than 45 min? Grab person 4.
