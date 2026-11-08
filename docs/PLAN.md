# Build plan (status at 2:00 PM)

Rule: **always have something demoable.**

## Done in code
- [x] Vibe presets (lo-fi, trap, house, boom bap, pop, ambient) + free-text keyword matching (`backend/vibes.py`)
- [x] Kits and instrument notes from ElevenLabs Sound Effects, cached by prompt (`backend/eleven.py`, `prewarm.py`)
- [x] One warm Daytona sandbox; every take analysed there (`backend/runners.py`, `sandbox/analyse.py`)
  - hit: onset detection → cleanest hit → drum slot from spectral centroid
  - hum: YIN pitch tracking → notes → 16th grid + key → register for melody or bass
  - texture: trimmed, crossfaded loop
- [x] Tone.js engine: drums in the vibe's pattern, chord pad + root bass, hummed parts on the instrument (synth
      fallback), texture/backing loops, offline export to WAV (`frontend/src/engine.ts`)
- [x] Mic capture timestamped on the audio clock, count-in, agent mic muted while recording (`recorder.ts`)
- [x] ElevenLabs agent client tools: set_vibe, record_part, set_part_slot, mute_part, remove_part, add_backing,
      export_song (`frontend/src/App.tsx`, `docs/AGENT.md`)
- [x] Vibe changes keep parts (hums move to the new key): handles the "actually, make it trap" curveball
- [x] Manual controls for everything, for testing without the agent

## To check today
- [ ] Each preset kit sounds good (re-prompt in `vibes.py` if not)
- [ ] Hum timing on your laptop + headphones (`LATENCY_NUDGE_MS`)
- [ ] Instrument root detection: if a melody sounds out of tune, the sample wasn't one clean note. Re-prompt it
- [ ] Backing track drift: ElevenLabs Music isn't stretched to our grid. If it drifts audibly, skip it in the demo

## Cut list if time runs out (in this order)
backing track → ambient/pop presets → bass hums (keep melody)

## Out of scope
Following the user's exact clap rhythm (the vibe owns the groove) and tempo detection (the vibe sets the tempo).
