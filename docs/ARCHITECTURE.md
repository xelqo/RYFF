# Architecture

## Core ideas
1. **You talk, the agent drives.** An ElevenLabs agent calls client tools in the browser (AGENT.md).
2. **The vibe sets tempo, key, groove, chords and instruments.** It can change any time; parts are kept and hums
   are moved to the new key.
3. **User sounds are ingredients.** A clap gives us its *sound* (the vibe decides the rhythm). A hum gives us a
   *tune* (snapped to the vibe's key and grid, played on the vibe's instrument).
4. **The browser owns playback and export** (Tone.js). The server turns vibes and takes into JSON + sample URLs.

## Vibe profile (`backend/vibes.py`)
Six presets; free text is keyword-matched to the nearest one ("rainy study beats" → lo-fi).
```ts
Vibe {
  text, genre, label, bpm, key, tonic /* midi */, scale, swing, bars: 4,
  pattern: { kick: number[], snare: number[], hat: number[], perc: number[] },  // 16th steps in ONE bar
  chords: number[][],     // one triad per bar (midi), from the preset's progression
  bass_roots: number[],   // one root per bar
  kit: { kick, snare, hat, perc },     // URLs of ElevenLabs Sound Effects one-shots
  instruments: { lead, bass }          // URLs of single sustained notes (root detected in the browser)
}
```

## Parts
```ts
Session { id, vibe: Vibe, parts: Part[] }
Part {
  id, name, kind: "drum" | "melody" | "bass" | "texture" | "backing", muted, volume,
  slot?, sample_url?,          // drum: the user's hit replaces that kit slot (latest drum part per slot wins)
  notes?, loop_steps?,         // melody/bass: { start_step, dur_steps, midi, velocity }[], loops every 2 bars
  loop_url?                    // texture / backing audio loop
}
```
Muting a drum part silences that drum; removing it brings the kit sound back.

## Recording (`frontend/src/recorder.ts`)
- Mic samples are captured on Tone's own AudioContext with their timestamps, so a take is cut exactly from the
  song's downbeat (minus measured output latency + `LATENCY_NUDGE_MS`).
- **drum:** the beat stops, 3 seconds are recorded clean. No timing needed.
- **melody / bass / texture:** 4 count-in clicks, the song starts on "1", 2 bars are recorded with a 0.15 s pre-roll.
- The agent's mic is muted while recording, and recording waits until the agent stops talking.

## Analysis in Daytona (`backend/runners.py`, `sandbox/analyse.py`)
One sandbox is created when the backend starts (warm before the first take). Per take: upload the WAV, run
`python3 analyse.py take.wav --kind … --bpm … --tonic … --scale … --steps 32 --pre-roll 0.15`, read one JSON
line, download the produced file. numpy only, so the sandbox needs no custom snapshot.
- `hit`: spectral-flux onsets → pick the loudest clean hit → trim, fade, normalise → slot from spectral centroid
  (< 600 Hz kick, > 6 kHz hat, ≥ 1.2 kHz snare, else perc).
- `melody` / `bass`: YIN pitch tracking → voiced segments → median pitch → 16th grid → key → register.
- `texture`: cut exactly 2 bars from the downbeat and crossfade the wrap.

`LOCAL_ANALYSIS_FALLBACK=1` runs the same script locally while developing.

## Playback (`frontend/src/engine.ts`)
Every change rebuilds the arrangement and restarts the loop from the top: drums (Sampler + Part per slot, with the
vibe's swing), chord pad + root bass (replaced by the backing track when there is one), hummed parts on a Sampler
with the instrument note (synth fallback if the note isn't clearly pitched), textures/backing as synced Players.
Export renders the same arrangement with `Tone.Offline` to a ≥ 15-second WAV with a fade-out.

## Endpoints (`backend/main.py`)
```
GET    /api/health                         sandbox status, ElevenLabs key present
GET    /api/vibes                          presets
POST   /api/sessions             {vibe_text}            → Session (kit generated with ElevenLabs SFX)
POST   /api/sessions/{id}/vibe   {vibe_text}            → Session (parts kept, hums re-keyed)
POST   /api/sessions/{id}/parts  multipart: audio, kind, name?, slot?, pre_roll, steps → {session, part}
PATCH  /api/sessions/{id}/parts/{pid}  {slot?, muted?, volume?, name?} → Session
DELETE /api/sessions/{id}/parts/{pid}                    → Session
POST   /api/sessions/{id}/backing {style?}               → Session (ElevenLabs Music)
GET    /files/...                                        samples, takes, loops
```
Session state is in memory.

## Latency
- Agent replies: a fast LLM in the agent settings.
- Takes: the sandbox is warm; analysis is ~1 s of numpy. Kits are cached; `prewarm.py` fills the cache.
- The backing track never blocks the conversation (`add_backing` doesn't wait for a response).
