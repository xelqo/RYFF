# Roles: who does what

**For AI coding agents:** find your person below (ask the user their name if you don't know it), read the docs
listed, then follow that person's brief. Only touch the folders that person owns. If a task needs a change in
someone else's folder or in the shared JSON shapes (docs/ARCHITECTURE.md), stop and tell the user so they can
coordinate in the group chat first.

| Person | Role | Owns | Branch |
|---|---|---|---|
| **Lucas** | Frontend | `frontend/` | `frontend` |
| **Derik** | Audio analysis + Daytona | `sandbox/`, `backend/daytona_runner.py` | `sandbox` |
| **Alex** | Backend + ElevenLabs Music, integration lead | `backend/` (except the files below), `spikes/music_test.py` | `backend` |
| **Avi** | Sound/prompt design + demo | `backend/vibes.py`, `backend/words.py`, `spikes/listen_test.py`, `docs/` | `sound` |

**Everyone reads first:** `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PLAN.md`.

**Shared rules**
- `main` always runs. Work on your branch, open small PRs often; **Alex merges**.
- Keys live in `.env` (copy `.env.example`), never committed, never in the frontend.
- The shared contract is the Session / Part / Version / Traits JSON in `docs/ARCHITECTURE.md`. Build against it
  and change it only after telling the group.
- Original code only: don't copy from other repos (ideas are fine).
- Check-in at ~hour 3 (step 0 results from Alex), then a 5-min standup every ~3 h. Stuck for more than 45 min? Grab Avi.

---

## Lucas: Frontend
**Also read:** `docs/DEMO.md`

**Brief for your agent:**
```
I am Lucas, the frontend owner. Work only in frontend/ on the branch "frontend".
Build a React + Vite + TypeScript app:
1. Vibe picker: 4 presets (chill lo-fi, dark trap, summer house, upbeat pop) + a free-text box.
2. Looping audio player for the current song version, with an audio-reactive visualiser (Web Audio AnalyserNode).
3. Guided "add a sound" prompts in order: drums ("clap or tap something"), bass ("hum something low"),
   melody ("hum a tune"), anything else. Each one skippable; the user can add more than one of a kind.
4. Recorder: pressing record PAUSES playback first, records with MediaRecorder, and stop sends the take.
5. A "producing…" state that shows the traits we heard (e.g. "busy · punchy · bright") while the next version
   generates. This wait is part of the experience, so make it feel good.
6. Version history: click any version to play it; adding a sound from an old version sends from_version.
The backend isn't ready yet: create frontend/mock/ with mock Session/Part/Version JSON matching
docs/ARCHITECTURE.md and a fake API module with the same endpoints, so switching to the real backend
(http://localhost:8000) is a one-line change. Use royalty-free mp3s as stand-in versions.
Make it look great on a projector and work on a phone. Commit small and often.
```
**Done when:** you can pick a vibe, hear v1, record a clap (music pauses), see "producing…", and hear v2 (mocked at
first, then real once Alex's backend is merged, ~hour 8).

---

## Derik: Audio analysis + Daytona
**Also read:** `docs/APIS.md` (Daytona section)

**Brief for your agent:**
```
I am Derik, owner of audio analysis + Daytona. Work only in sandbox/ and backend/daytona_runner.py,
on the branch "sandbox".
1. sandbox/analyse.py: `python analyse.py take.wav --kind drums|bass|melody|texture` prints Traits JSON exactly
   as in docs/ARCHITECTURE.md (busyness, punch, brightness; for bass/melody also pitch_register, contour,
   smoothness; plus length_s), using librosa only (pyin for pitch). Trim silence first; print an error JSON if the
   take is near-silent. Normalise values to 0-1 with sensible ranges, tested on real claps/hums in spikes/takes/.
2. sandbox/mix.py: loudness-normalise an mp3 to -14 LUFS and add short fades so it loops cleanly (ffmpeg).
3. sandbox/requirements.txt + a script that builds a Daytona snapshot named "loopstack-audio" with the deps
   preinstalled (librosa, soundfile, numpy, ffmpeg) so sandboxes start ready.
4. backend/daytona_runner.py: a class with start(session_id) to create or reuse ONE sandbox per session,
   analyse(local_wav, kind) to upload, run analyse.py and return the parsed dict, mix(local_mp3) to return a local
   mixed file path, and stop(session_id) to delete the sandbox.
Verify the Daytona SDK method names against the real docs (marked ⚠︎ in docs/APIS.md) and fix APIS.md.
Run everything locally first, then in Daytona.
```
**Done when:** Alex's backend can call `runner.analyse("take.wav", "melody")` and get sensible traits back from a
Daytona sandbox in a couple of seconds.

---

## Alex: Backend + ElevenLabs Music (integration lead)
**Also read:** `docs/APIS.md`, `docs/TEAM.md`

**Brief for your agent:**
```
I am Alex, owner of the backend + ElevenLabs Music and the integration lead. Work in backend/ (not vibes.py,
words.py or daytona_runner.py, which belong to Avi and Derik) on the branch "backend".
FIRST do PLAN.md step 0 in spikes/music_test.py with ElevenLabs Music (model music_v2, composition_plan):
 a) time a 30 s "chill lo-fi, 80 BPM, instrumental" generation
 b) print all response headers to find the song_id header; check whether store_for_inpainting is needed
 c) generate v2 with conditioning_ref -> v1 + "soaring rhodes melody enters" (try condition_strength high vs xhigh,
    same seed)
 d) same song with "busy punchy drums" vs "sparse soft drums"
Save every mp3 in spikes/out/ with clear names and write the findings into docs/APIS.md (resolve the ⚠︎ items).
THEN build a FastAPI backend: POST /sessions {vibe_text}, POST /sessions/{id}/parts (multipart audio, kind,
from_version?), GET /sessions/{id}, GET /files/{path}. In-memory state. A composition-plan builder
(vibe + all parts' words -> 2-3 chunks, conditioning_ref on the first chunk pointing at the previous version, same
seed every version). Call backend/daytona_runner.py (Derik) for traits + mixing, and backend/vibes.py +
backend/words.py (Avi) for styles and words. Stub those until they land. Keys from .env only. CORS for Vite.
```
**Done when:** step 0 results are shared at the ~hour-3 check-in, and by ~hour 8 the real API serves Lucas's
frontend end to end. You also review and merge everyone's PRs.

---

## Avi: Sound/prompt design + demo
**Also read:** `docs/APIS.md` (Music section), `docs/DEMO.md`

**Brief for your agent:**
```
I am Avi, owner of sound/prompt design and the demo. Work in backend/vibes.py, backend/words.py,
spikes/listen_test.py and docs/, on the branch "sound".
1. backend/vibes.py: 4 preset vibes (chill lo-fi, dark trap, summer house, upbeat pop), each with a styles list,
   bpm, negative styles (always include vocals/singing), and the instrument for each part kind
   (drums/bass/melody/texture). Plus vibe_from_text(text) mapping free text to the closest preset by keywords.
2. backend/words.py: traits_to_words(kind, traits, vibe) -> list of style phrases, following the table in
   docs/ARCHITECTURE.md, with 2-3 levels per trait (e.g. sparse / steady / busy) and the vibe's instrument names.
3. spikes/listen_test.py: generate the same vibe with different words via ElevenLabs Music (15-30 s to save
   credits) so I can judge by ear which phrases really change the sound. Log results in docs/SOUND_NOTES.md
   and tune the words until every added part is clearly audible.
Later: using docs/DEMO.md, write the Devpost text, a 5-slide outline and a 2-minute spoken script.
```
**Done when:** every preset sounds good on its own, each added part is obviously audible in the next version, and
the demo script, slides, Devpost and a backup video are ready before feature freeze. You're also the floater:
help whoever's stuck, and record test claps/hums for the team in `spikes/takes/`.
