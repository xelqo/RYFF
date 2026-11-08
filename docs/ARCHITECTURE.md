# Architecture

## Core ideas
1. **The vibe is chosen once, at the start, and never changes.** It decides tempo, key, groove and instruments.
2. **User sounds are ingredients, not exact performances.** A clap gives us its *sound*; the vibe decides the rhythm.
   A hum gives us a *tune*; the vibe decides tempo, key and instrument.
3. **Parts can be added at any time, in any order.** Only the vibe is required.
4. **The browser owns playback** (Tone.js `Transport` at the vibe's BPM). The server turns vibes and takes into data
   plus sample URLs.

## Vibe profile
Built once from the vibe text. A lookup table of ~8 genres (lo-fi, trap, house, EDM, boom bap, pop, R&B, ambient)
plus a small LLM call or keyword match maps free text onto it.
```ts
Vibe {
  text: "chill lo-fi",
  genre: "lofi",
  bpm: 80, key: "A minor", bars: 4,
  drum_pattern: { kick: number[], snare: number[], hat: number[], perc: number[] },  // 16th-note steps per bar
  swing: 0.15,
  instruments: {
    kick:  "dusty lo-fi kick drum, single hit, dry",
    snare: "soft lo-fi snare, single hit, dry",
    hat:   "lo-fi closed hi-hat, single hit",
    bass:  "warm muted electric bass note C2, sustained, dry",
    lead:  "mellow rhodes electric piano note C4, sustained, dry"
  },
  backing_prompt?: "chill lo-fi hip hop, vinyl crackle, 80 BPM, A minor, instrumental"
}
```
The patterns per genre are hand-written templates. That's reliable and sounds right; no AI is needed for the groove.

## Parts
```ts
Session { id, vibe: Vibe, parts: Part[], backing?: { url } }

Part {
  id, kind: "drum" | "melody" | "bass" | "texture",
  raw_url,                              // the user's original take
  muted, volume,
  // drum: the user's sound replaces (or layers on) one kit slot
  slot?: "snare" | "kick" | "hat" | "perc",
  sample_url?: string,                  // the cleanest hit cut from the take
  // melody / bass
  notes?: { start_step, dur_steps, midi, velocity }[],
  instrument_url?: string, root_midi?: number,   // the vibe's instrument note (ElevenLabs)
  // texture
  loop_url?: string
}
```
**Default slot for a user hit:** claps and snaps go to `snare`, low thumps to `kick`, "tss"/shakers to `hat`, and
anything else to `perc`. Decide by spectral centroid + decay in the sandbox. The user can change the slot in the UI.

## Flows
**Start session:** `POST /sessions {vibe_text}` → build the vibe profile → generate the kit and instrument notes
with ElevenLabs SFX in parallel (cache by prompt; preset vibes are pre-generated) → the beat plays at once. The
Daytona sandbox spins up in the background.

**Add a part:** the user hits record (the beat can keep playing; a click on the vibe's tempo helps hums land in time)
→ `POST /sessions/{id}/parts` with the audio + optional `kind` → backend uploads it to the sandbox and runs
`python analyse.py take.wav --bpm 80 --key "A minor" --bars 4`:
- `hit`: onset detect → cut the cleanest, loudest hit → trim the tail → normalise → `sample_url` + suggested `slot`.
  The rhythm the user clapped is ignored (that's the "loose" part).
- `hum`: basic-pitch (or librosa `pyin`) → notes → quantise to the 16th grid at the vibe BPM → snap to the vibe key →
  drop notes shorter than a 16th. Mostly low notes means `bass`, otherwise `melody`.
- `texture`: trim to the loop length and crossfade the ends with ffmpeg.
- `auto` (default): classify. Pitched and sustained is a hum; short transients are hits; everything else is texture.

The browser schedules the new part from the next loop start.

**Backing track (optional button):** ElevenLabs Music with the vibe's `backing_prompt`, `force_instrumental: true`,
`music_length_ms` = loop × N. In the sandbox: beat-track it → align the downbeat → time-stretch to the vibe BPM →
trim to whole bars. ElevenLabs Music can't take user audio, which is fine because the vibe drives it.

**Export:** render the mixdown in the sandbox (or in the browser with `Tone.Offline`) → wav/mp3.

## Why Daytona
- Analysis needs heavy dependencies (basic-pitch/TensorFlow, librosa, ffmpeg, rubberband). They live in a prebuilt
  sandbox **snapshot**, not on the web server.
- One warm sandbox per session holds that session's audio files and is deleted when the session ends.
- Stretch: generated DSP code for effects ("make my hum sound underwater") runs safely in the sandbox.

## Endpoints
```
POST   /sessions                    {vibe_text}                 → Session (vibe + kit sample URLs)
POST   /sessions/{id}/parts         multipart: audio, kind?     → Part
PATCH  /sessions/{id}/parts/{pid}   {slot?, kind?, muted?, volume?} → Part
DELETE /sessions/{id}/parts/{pid}
POST   /sessions/{id}/backing                                   → {url}
POST   /sessions/{id}/export                                    → {url}
GET    /files/{path}
```
In-memory session state is fine for the hackathon.

## Latency (target: under 5 s from "stop recording" to hearing the part)
- Create the sandbox when the session starts, never per part.
- Pre-generate the kits for preset vibes; cache every ElevenLabs result by prompt.
- While analysis runs, show the part card as "listening…" with a waveform so the wait feels intentional.
