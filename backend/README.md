# Backend (Alex)

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000        # keys from ../.env
curl localhost:8000/health
```

## API (for Lucas)
| Call | Body | Returns |
|---|---|---|
| `POST /sessions` | JSON `{vibe_text}` | Session, `status: "building"` |
| `PATCH /sessions/{id}/vibe` | JSON `{vibe_text}` | `{status: "building", vibe}`. Parts are kept and reworded; no conditioning on the old beat |
| `POST /sessions/{id}/parts` | multipart: `audio` (any MediaRecorder file), `kind` (drums/bass/melody/texture), `from_version?` | `{part, status: "building"}` **right after analysis**, so the agent can talk. If too quiet: `{part: null, error}` |
| `GET /sessions/{id}` | – | Session. **Poll this** every ~1 s while `status == "building"`; then `versions[-1].url` is the new song |
| `GET /agent-token` | – | `{token}` for `startSession({ conversationToken })` |
| `GET /files/...` | – | audio (version `url`s and `raw_url`s are relative to the backend) |
| `GET /health` | – | which keys are set, which runner is active |

Session: `{id, vibe: {text, name, styles, bpm, instruments}, parts: [{id, kind, raw_url, traits, words}],
versions: [{n, url, song_id, reason, conditioned, from_version, plan}], status: "building"|"ready"|"error", error}`

Generations run one at a time per session, in request order. If two parts arrive fast, both versions get built.

## Teammate modules
`contrib.py` imports `vibes.py` / `words.py` (Avi) and `daytona_runner.py` (Derik) and uses built-in stand-ins
until they exist. The interfaces are documented at the top of `contrib.py`. Drop your file into `backend/` and it's
picked up on restart.

## Tuning (`.env`)
`VERSION_MS` (default 20000), `MUSIC_MODEL` (music_v2), `CONDITION_STRENGTH` (high), `SONG_ID_HEADER`
(set once step 0 finds it), `USE_CACHE=1` (preset v1 saved to and served from `backend/cache/`).
