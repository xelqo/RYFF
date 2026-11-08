# Build plan

Rule: **always have something demoable.** Each milestone ends with a working app, even if ugly.

## Step 0: risk tests (first ~2–3 hours, before any UI)
Two questions decide whether this sounds good:
1. **Hum → melody:** record a 4-bar hum over an 80 BPM click. basic-pitch (and librosa `pyin`) → notes → snap to the
   grid and the key → play it on ONE ElevenLabs-generated "rhodes note C4, sustained, dry" pitch-shifted per note.
   Does it still sound like the tune you hummed?
2. **Clap → drum:** record a few claps → cut the cleanest hit → drop it in as the snare of a lo-fi pattern with an
   ElevenLabs kick + hat. Does it sit in the beat or sound like a random noise?

**Go / no-go:** if hums are messy, snap harder to the scale, merge short notes, or default hums to bass (fewer,
longer notes). If raw claps sound bad, layer the user's clap *over* the generated snare instead of replacing it.

## Milestone 1: vibe → beat (no mic yet)
- [ ] 3–4 vibe presets (lo-fi, trap, house, pop) as hand-written profiles: bpm, key, patterns, instrument prompts
- [ ] Kits generated with ElevenLabs SFX and cached
- [ ] Frontend: vibe picker → the beat plays on a loop with play/pause. **Already a demo.**

## Milestone 2: add sounds
- [ ] Recorder (records while the beat plays, with an optional click), part cards with mute/delete/redo
- [ ] `sandbox/analyse.py`: hit / hum / texture / auto → JSON (run it locally first)
- [ ] Daytona snapshot with deps; backend runs analyse in a per-session sandbox
- [ ] Hits drop into a kit slot; hums play as melody/bass on the vibe's instrument

## Milestone 3: free-text vibes + polish
- [ ] Free-text vibe → nearest preset genre + adjusted instrument prompts (keyword match or a small LLM call)
- [ ] Visuals: each part has a colour and pulses on its hits/notes, so the audience SEES the song stack up
- [ ] Optional backing track (ElevenLabs Music, stretched to the grid)
- [ ] Export mixdown

## Cut list if time runs out (in this order)
export → backing track → free-text vibes (keep presets) → auto-detect (make the user pick drum/melody)

## Out of scope (decided)
- Changing the vibe mid-session
- Following the user's exact clap rhythm (the vibe owns the groove)
- Tempo detection (the vibe sets the tempo)
