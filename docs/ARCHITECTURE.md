# Architecture

## Core idea: one shared loop
Like a loop pedal, everything plays on one clock.
- The session has a **BPM** (default 90), a **key** (detected from the first hum, or picked), and a **loop length**
  (2 or 4 bars).
- Every recording gets a **1-bar count-in plus a metronome**, so takes start on the beat. That makes analysis far
  easier than guessing the tempo from free-form clapping. Detecting tempo from the first clap is a stretch goal.
- The browser owns playback (Tone.js `Transport`). The server only turns raw takes into **layers**.

## Data model
```ts
Session {
  id, bpm, key, bars,            // e.g. 90, "A minor", 4
  layers: Layer[],
  backing?: { url, prompt }      // ElevenLabs Music track, optional
}

Layer {
  id, kind: "rhythm" | "melody" | "texture",
  raw_url,                        // the user's original take
  muted, volume,
  // rhythm
  pattern?: { step: number, velocity: number }[],   // 16th-note steps across the loop
  // melody
  notes?: { start_beat, dur_beats, midi, velocity }[],
  // how it sounds
  sound: { source: "own" | "elevenlabs", prompt?: string, sample_url: string, root_midi?: number }
}
```

## Request flow: adding a layer
1. **Browser** records the take with `MediaRecorder` (it knows exactly which beat recording started on) and POSTs
   `/sessions/{id}/layers` with the audio + `kind` (or `auto`) + optional text ("make it an 808").
2. **Backend** uploads the take to the session's **Daytona sandbox** and runs `python analyse.py take.wav --bpm 90 --bars 4`:
   - `rhythm`: `librosa.onset.onset_detect` → times → snap to the 16th grid → `pattern`. Also slices the loudest hit
     as the user's "own" sample.
   - `melody`: Spotify **basic-pitch** (or librosa `pyin`) → notes → snap to the grid and the session key → `notes`.
     If the session has no key yet, estimate it from these notes.
   - `texture`: trim/loop-crossfade the take to exactly the loop length with ffmpeg.
   - `auto`: classify. Pitched and sustained means melody; short transients mean rhythm.
   - Prints JSON to stdout; the backend reads it.
3. **Backend** gets the sound from **ElevenLabs Sound Effects** (`/v1/sound-generation`):
   - rhythm: one-shots, e.g. "single punchy 808 kick drum hit, dry, no reverb", `duration_seconds: 0.5`
   - melody: ONE sustained note, e.g. "single sustained cello note C3, dry, no reverb", `duration_seconds: 2`.
     The browser pitch-shifts it per note (Tone.js `Sampler` with that note as the root).
   - texture: `loop: true` to re-imagine the take as a loop ("rain on a window")
   - Cache by prompt, since the same "808 kick" never needs regenerating.
4. **Browser** gets the layer JSON + sample URLs and schedules it on the transport at the next loop start.

## Backing track (optional "fill it out" button)
- ElevenLabs Music (`/v1/music`) with a prompt built from the session: style text + `"90 BPM, A minor,
  instrumental"`, `force_instrumental: true`, `music_length_ms` = loop length × N.
- **Risk:** the generated track won't land exactly on our grid. In the sandbox, `librosa.beat.beat_track` → find the
  first downbeat → time-stretch (rubberband / ffmpeg `atempo`) to our BPM → trim to whole bars.
- ElevenLabs Music does **not** accept our audio as input (see APIS.md), so the user's layers steer it only through
  BPM, key and words.

## Why Daytona (how we'll pitch it)
- Analysis needs heavy dependencies (basic-pitch/TensorFlow, librosa, ffmpeg, rubberband). They live in a prebuilt
  sandbox **snapshot**, not on the web server.
- One sandbox per jam session: isolated, warm, and it holds that session's audio files. It's deleted when the session ends.
- Stretch goal: an "effects agent" that writes and runs its own DSP code in the sandbox for requests like "make my
  hum sound underwater". That's arbitrary generated code, which is exactly what a sandbox is for.

## Backend endpoints
```
POST   /sessions                        → {id, bpm, key, bars}   (starts the sandbox)
POST   /sessions/{id}/layers            multipart: audio, kind, prompt?  → Layer
PATCH  /sessions/{id}/layers/{lid}      {prompt?, muted?, volume?}       → Layer (new prompt = new sound)
DELETE /sessions/{id}/layers/{lid}
POST   /sessions/{id}/backing           {style}                          → {url}
POST   /sessions/{id}/export            → mixdown wav/mp3 (rendered in the sandbox)
GET    /files/{path}                    serves samples/takes
```
Session state can live in memory (a dict) during the hackathon; that's fine.

## Latency budget (aim: under 5 s from "stop recording" to hearing the layer)
- Upload + sandbox analysis: 1–2 s if the sandbox is already warm. **Create it when the session starts, not per layer.**
- ElevenLabs SFX: a few seconds. Kick off generation **as soon as the user picks a sound** and in parallel with analysis.
- While waiting, play the user's own raw take quantised to the loop so there's never silence.
