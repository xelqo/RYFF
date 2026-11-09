# Backend (Alex)

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000        # keys from ../.env
curl localhost:8000/health
```

## API (for Lucas)
| Call | Body | Returns |
|---|---|---|
| `POST /sessions` | JSON `{vibe_text, key?}` | Session, `status: "building"` |
| `PATCH /sessions/{id}/vibe` | JSON `{vibe_text}` | `{status: "building", vibe}`. Parts are kept and reworded; no conditioning on the old beat |
| `POST /sessions/{id}/parts` | multipart: `audio` (any MediaRecorder file), `kind` (drums/bass/melody/texture), `from_version?` | `{part, status: "building"}` **right after analysis**, so the agent can talk. If too quiet: `{part: null, error}` |
| `GET /sessions/{id}` | – | Session. **Poll this** every ~1 s while `status == "building"`; then `versions[-1].url` is the new song |
| `POST /key` | multipart: `audio` (a short hum) | `{key: "D minor", tonic, scale, confidence}` or `{error}`. Analysed in Daytona. Pass `key` to `POST /sessions` |
| `POST /transcribe` | multipart: `audio` | `{text}` (ElevenLabs Scribe, English) |
| `GET /agent-token` | – | `{token}` for `startSession({ conversationToken })` |
| `GET /files/...` | – | audio (version `url`s and `raw_url`s are relative to the backend) |
| `GET /health` | – | which keys are set, which runner is active |

Session: `{id, vibe: {text, name, styles, bpm, instruments}, parts: [{id, kind, raw_url, traits, words}],
versions: [{n, url, song_id, reason, conditioned, from_version, plan}], status: "building"|"ready"|"error", error}`

Generations run one at a time per session, in request order. If two parts arrive fast, both versions get built.

## Daytona
`analysis.py` adapts Derik's `runners.py` + `sandbox/analyse.py` (one warm sandbox for the server) into traits and
a cut-out hit sample per drum part (`hit_url`). Needs `DAYTONA_API_KEY`; `LOCAL_ANALYSIS_FALLBACK=1` runs the same
script locally while developing. Uploads can be webm/ogg/mp4/wav (converted with ffmpeg). `sandbox/mix.py` (also run in the
sandbox) finds each version's tempo + beat and layers the user's real hits on it: kick on every beat, snare/clap/perc
on 2 and 4, hat on the off-beats; then -14 LUFS. Any mixing failure falls back to the unmixed song.

## Voice agent
`create_agent.py` creates the "Loopstack producer" agent (voice Charlie, gemini-2.5-flash) and its 5 client tools
from the prompt and first message in `docs/AGENT.md`, then writes `ELEVENLABS_AGENT_ID` to `.env`. Re-running it
updates the same agent (it adds fresh tool copies each run; old ones can be deleted in the dashboard).

## Teammate modules
`contrib.py` imports `vibes.py` / `words.py` (Avi) and uses built-in stand-ins until they exist. The interfaces are documented at the top of `contrib.py`. Drop your file into `backend/` and it's
picked up on restart.

## Tuning (`.env`)
`VERSION_MS` (default 20000), `MUSIC_MODEL` (music_v2), `CONDITION_STRENGTH` (high), `SONG_ID_HEADER`
(set once step 0 finds it), `USE_CACHE=1` (preset v1 saved to and served from `backend/cache/`).
