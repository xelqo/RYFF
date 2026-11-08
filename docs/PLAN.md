# Build plan

Rule: **always have something demoable.** Each milestone ends with a working app, even if ugly.

## Step 0: risk test (first ~2 hours, before any UI)
The whole project depends on one question: **does a hummed melody sound good once it's turned into an instrument?**
Test it in `spikes/` with plain Python scripts:
1. Record a 4-bar hum at 90 BPM with a metronome (any phone voice memo works).
2. basic-pitch → notes. Print them. Do they match what you hummed? Try librosa `pyin` too and keep the better one.
3. Snap the notes to a 16th grid and the key.
4. Generate ONE "sustained cello note C3, dry" with ElevenLabs SFX, then render the notes with it (pitch-shift per note,
   or write a MIDI file and play it in GarageBand with that sample as a quick check).
5. Same for claps: onsets → pattern → trigger a generated 808 kick. Does it groove?

**Go / no-go:** if hum → notes is too messy, simplify. Snap harder to the scale, use only longer notes, or treat hums
as bass lines (fewer, longer notes forgive more). Decide this before building the UI.

## Milestone 1: the loop pedal (no AI yet)
- [ ] Frontend: BPM + bars picker, metronome, count-in, record button, layer list with mute/delete
- [ ] Tone.js transport loops every layer in sync; recorded takes trimmed to the loop and played raw
- [ ] Works on laptop mic. **This alone is already a demo.**

## Milestone 2: analysis in Daytona
- [ ] `sandbox/analyse.py` (rhythm / melody / texture / auto) → JSON
- [ ] Daytona snapshot with deps; backend creates one sandbox per session and runs analyse on each take
- [ ] Rhythm layers play as patterns of the user's own hit; melody layers as notes on a basic synth

## Milestone 3: ElevenLabs sounds
- [ ] Sound picker per layer: presets (808 kick, snare, shaker, cello, synth bass, piano, choir) + free text
- [ ] SFX generation → sample → Tone `Sampler` / `Player`; cache by prompt
- [ ] Text box "make the clap an 808" → maps to a layer + prompt (a simple keyword match is fine; LLM is optional)

## Milestone 4: polish (what wins the room)
- [ ] Backing track button (ElevenLabs Music at session BPM/key, stretched to the grid in the sandbox)
- [ ] Visuals: each layer has a colour and pulses on its hits/notes (the audience must SEE the layers stacking)
- [ ] Export mixdown → download / share link
- [ ] Stretch: tempo from the first clap, "auto" layer type, effects agent in the sandbox

## Cut list if time runs out (in this order)
export → backing track → free-text sounds (keep presets) → auto-detect layer type (make the user pick)

## Who does what
| Track | Step 0 | M1 | M2 | M3 | M4 |
|---|---|---|---|---|---|
| Frontend/audio | metronome+recorder prototype | owns | wire layers | sampler | visuals |
| Backend/Daytona | hum→notes spike | API skeleton | owns | caching | export, stretch |
| ElevenLabs/sound | SFX prompt tests | preset list | | owns | backing track |
| Pitch/demo | write DEMO.md, record backup video early | | | | Devpost, slides |
