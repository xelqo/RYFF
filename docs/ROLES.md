# Roles: who does what (shipped build)

**For AI coding agents:** find your person below (ask the user their name if you don't know it), read the docs
listed, then follow that person's brief. Only touch the folders that person owns. If a task needs a change in
someone else's folder or in the shared Session JSON (docs/ARCHITECTURE.md), stop and tell the user first.

| Person | Role | Owns |
|---|---|---|
| **Lucas** | Frontend + voice agent wiring | `frontend/` |
| **Derik** | Audio analysis + Daytona | `sandbox/`, `backend/runners.py` |
| **Alex** | Backend + ElevenLabs, integration lead | `backend/` (except `vibes.py` and `runners.py`) |
| **Avi** | Sound/prompt design, agent config, demo | `backend/vibes.py`, `docs/` |

**Everyone reads first:** `CLAUDE.md`, `README.md`, `docs/AGENT.md`, `docs/ARCHITECTURE.md`.

**Shared rules**
- `main` always runs; Alex merges. Keys live in `.env`, never committed, never in the frontend.
- Agent tool names and parameters must match in three places: the ElevenLabs dashboard, `docs/AGENT.md` and
  `frontend/src/App.tsx`.
- Original code only. Submission at 4:15: repo link + 2-minute Loom of a live conversation + track/user/finish line.

---

## Lucas: Frontend
```
I am Lucas, the frontend owner. Work only in frontend/.
The app is built: App.tsx (agent client tools + UI), engine.ts (Tone.js playback + export), recorder.ts (mic capture),
Visualizer.tsx. Get it running against the real backend, then:
1. Check recording timing: hum on the beat after the count-in; if notes land early/late, tune LATENCY_NUDGE_MS.
2. Make sure the agent's mic is muted during takes and the producer never talks over a recording.
3. Polish for a projector: big readable status, count-in, part cards that pulse.
Don't change tool names or parameters without updating docs/AGENT.md.
```
**Done when:** vibe → clap → hum → "make it trap" → export works by voice and by the manual buttons.

## Derik: Audio analysis + Daytona
```
I am Derik, owner of audio analysis + Daytona. Work only in sandbox/ and backend/runners.py.
sandbox/analyse.py (numpy only) turns a take into: hit (cleanest hit + drum slot), melody/bass (YIN pitch -> notes
snapped to key + 16th grid) or texture (seamless 2-bar loop). backend/runners.py boots ONE warm Daytona sandbox at
server start and runs analyse.py there.
1. Put DAYTONA_API_KEY in .env, start the backend, confirm /api/health shows sandbox "ready".
2. Record real claps, snaps, "tss", table knocks and hums; check slots and notes. Tune thresholds in classify_hit
   and the voicing gate in analyse_hum if needed. Keep it numpy-only and printing one JSON line.
3. Measure take → result time; it should be ~1-2 s.
```
**Done when:** real takes come back from Daytona in a couple of seconds with the right drum slot and the right tune.

## Alex: Backend + ElevenLabs (integration lead)
```
I am Alex, backend owner and integration lead. Work in backend/ (not vibes.py or runners.py).
main.py serves sessions, vibe changes, parts (analysis via runners.py), patches, deletes and the ElevenLabs Music
backing track; eleven.py calls ElevenLabs Sound Effects + Music with an on-disk cache.
1. Put ELEVENLABS_API_KEY in .env, run python prewarm.py, then exercise every endpoint from the UI.
2. Watch for ElevenLabs 429s/credit errors; keep the kit cache warm before the demo.
3. Merge PRs and keep main runnable.
```
**Done when:** a full session works end to end with no backend errors, and preset kits load instantly from cache.

## Avi: Sound design, agent config, demo
```
I am Avi, owner of sound/prompt design, the voice agent config and the demo. Work in backend/vibes.py and docs/.
1. Create the agent exactly as in docs/AGENT.md (7 client tools, system prompt, English + Spanish), put its ID in
   frontend/.env as VITE_ELEVENLABS_AGENT_ID, and test it.
2. Listen to every preset kit (python prewarm.py, then play the files in backend/files/cache/). Re-prompt any bad
   kick/snare/hat/perc or instrument note in vibes.py.
3. Rehearse docs/DEMO.md and record the 2-minute Loom at ~3:50.
```
**Done when:** the producer sounds good and stays short, every kit sounds right, and the Loom is recorded.
