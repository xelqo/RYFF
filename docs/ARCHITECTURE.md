# Architecture

## Core ideas
1. **The vibe can change by voice.** It sets the genre, tempo and mood. A change keeps every part and regenerates the song without `conditioning_ref`, since the old beat would pull it back.
2. **The song is regenerated as a whole** each time a sound is added. Every version is a full ElevenLabs Music track
   that builds on the previous one (`conditioning_ref`). We don't layer or sync audio ourselves.
3. **User sounds do two jobs.** Rough traits become words in the song's description. For hits, `mix.py` also layers the real sample onto the track so the user can hear it.
4. **Recording only happens while the music is paused.** That means no bleed from the speakers, and the pause hides
   generation time.
5. **A voice agent ("the producer", ElevenLabs Agents) guides the user** with spoken prompts for parts (drums → bass → melody → anything else). Each is optional,
   and the user can add more than one of a kind.

## Voice agent
Full design in [AGENT.md](AGENT.md). It lives in the frontend (`@elevenlabs/react`), drives the app through
client tools (`set_vibe`, `record_sound`, `play_version`, `skip_part`, `download_song`), and is **muted whenever
music plays or a sound is being recorded**. The backend only mints its auth token (`GET /agent-token`).

## Data model
```ts
Session {
  id,
  vibe: { text: "chill lo-fi", styles: string[], bpm: number },   // styles = words fed to every version
  parts: Part[],                    // in the order they were added
  versions: Version[],              // v1 = vibe only, then one per added part
  seed: number                      // reused for every version to keep them consistent
}

Part {
  id, kind: "drums" | "bass" | "melody" | "texture",   // known from the prompt the user answered
  raw_url,                                             // the user's take
  hit_url?,                                            // cleanest hit cut from a drum take
  traits: Traits,
  words: string[]                                      // e.g. ["busy punchy drums", "crisp claps"]
}

Traits {                     // all rough, 0–1 or a small label
  busyness,                  // onsets per second
  punch,                     // transient strength / crest factor
  brightness,                // spectral centroid
  pitch_register?: "low" | "mid" | "high",            // hums only
  contour?: "rising" | "falling" | "arch" | "flat",   // hums only
  smoothness?,               // legato vs choppy (hums)
  length_s
}

Version { n, song_id, url, plan, created_at }
```

## Traits → words (backend, plain code)
A small lookup that's easy to tune. Examples:
| kind | traits | words added to the plan |
|---|---|---|
| drums | busy + punchy | "driving, busy drums", "punchy claps", "lots of hi-hats" |
| drums | sparse + soft | "laid-back, sparse drums", "soft brushed snare" |
| bass | low + smooth | "deep, smooth sub bass" |
| melody | high + rising + smooth | "soaring, rising lead melody" |
| melody | mid + choppy | "playful, plucky staccato melody" |
| texture | bright | "shimmering ambient texture"; dark: "warm, dusty background texture" |

The vibe picks the instrument (lo-fi melody means rhodes, house means synth lead, etc.) from a small genre table.

## Building each version's composition plan (ElevenLabs Music v2)
- One loop-friendly song of ~30 s, as 2–3 chunks (e.g. intro 8 s / main 22 s).
- `positive_styles` = vibe styles + `"{bpm} BPM"` + `"instrumental"` + every part's words so far.
- `negative_styles` = `["vocals", "singing"]` (+ anything the vibe excludes).
- From version 2 on, the **first chunk** carries
  `conditioning_ref: { song_id: <previous version>, range: { start_ms: 0, end_ms: 10000 } }` with
  `condition_strength: "high"`, so the beat stays recognisable and the new part comes in on top.
- Same `seed` every time.
- Ask for the new part explicitly in `text`, e.g. `"{new: soaring rising rhodes melody enters}"`.

## Flows
**Start:** `POST /sessions {vibe_text}` → map the vibe to styles + bpm → generate v1 → return the URL. The Daytona
sandbox starts in the background.

**Add a part:** the user answers a prompt → the frontend **pauses playback** → records → `POST /sessions/{id}/parts`
(audio + kind) → backend uploads to the sandbox → `python analyse.py take.wav --kind melody` prints the traits
JSON → traits → **the endpoint returns the part and traits immediately so the agent can talk** → in the background: words → new plan → ElevenLabs Music → store `song_id` + audio → `mix.py` in the sandbox (detect beats with `librosa.beat`, layer each kept hit on the beats, loudness-normalise, fade the loop ends) → the frontend polls `GET /sessions/{id}`, plays the new Version, and sends the agent a contextual update.

**Change vibe:** `PATCH /sessions/{id}/vibe` → new styles, same part words, no `conditioning_ref` → `mix.py` re-applies the kept hits. Meanwhile the UI shows
what we "heard": *"busy · punchy · bright"*.

**Undo / history:** go back to any version. Adding a part from there branches off that version's `song_id`.

**Export:** download the chosen version (mp3/wav).

## Analysis (in the sandbox, librosa only, no heavy ML)
- `busyness`: `librosa.onset.onset_detect` count / length
- `punch`: mean onset strength, peak/RMS ratio
- `brightness`: mean spectral centroid, normalised
- hums: `librosa.pyin` → median pitch (register), linear fit over time (contour), pitch-change rate (smoothness)
- Trim silence first; reject takes that are almost silent ("didn't catch that, try again").

## Why Daytona
- Each jam session gets its own isolated sandbox holding its takes and versions, deleted when the session ends.
- Analysis + mixing (librosa, ffmpeg) run there, not on the web server.
- The user's real hit is cut out and mixed into each version here, using beats detected on the generated audio.

## Endpoints
```
POST /sessions                     {vibe_text}              → Session (v1 cached for presets, otherwise status building)
PATCH /sessions/{id}/vibe          {vibe_text}              → {status: "building"}
POST /sessions/{id}/parts          multipart: audio, kind, from_version? → {part, status: "building"}
GET  /sessions/{id}                                          → Session
GET  /agent-token                                            → {token}  (ElevenLabs Agents conversation token)
GET  /files/{path}
```
In-memory session state is fine for the hackathon.

## Latency
- Generation time is the big unknown: **measure it in step 0.** If it's long, keep versions short (~20–30 s) and
  make the wait a feature: show the traits and a "producing…" animation.
- Start the sandbox at session start, never per part.
- Pre-generate v1 for each preset vibe.
