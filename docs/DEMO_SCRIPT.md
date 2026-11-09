# RYFF demo script (~3 min, 4 speakers)

**Roles on stage:** **Avi** opens/closes and drives the laptop · **Lucas** = the browser / recording · **Derik** = Daytona
(audio analysis + mixing) · **Alex** = backend + ElevenLabs Music.
Wired mic or headphones. Fallback UI: `localhost:5173/?classic`. Keep a pre-recorded clap + hum ready to **Upload**.

---

## 0. Hook (Avi, 15 s) · screen: "RYFF." wordmark
> "Everyone has a beat or a tune in their head and no way to get it out. RYFF is a producer you don't need any
> skills for: you hum, clap and talk, and it builds an original song out of *your* sounds, one layer at a time.
> Everything you're about to hear is generated live."

*Click RYFF.* The producer says: "Hum a few notes to set the key, or skip."

## 1. Hum the key (Derik, 25 s) · screen: orb "Hum now · 5"
*Click **Hum the key**, hum 4–5 notes.*
> "That hum just went to a **Daytona sandbox**. Every bit of audio processing runs there, never on our web server.
> It tracks the pitch of my hum frame by frame with the YIN algorithm, turns it into notes, and we match those
> notes against the 24 major and minor keys (Krumhansl key profiles). It heard **D minor**, so every version of
> this song will be generated in D minor, which means anything we hum later fits."

*If asked:* numpy only, so the sandbox needs no special image; one warm sandbox is reused so there's no cold start;
analysis takes about one second.

## 2. Say the vibe (Lucas, 25 s) · screen: "Say your vibe"
*Click **Say your vibe**, say e.g. "chill lo-fi for late-night studying".*
> "The browser captures raw audio straight from the mic with the Web Audio API. We build the WAV ourselves,
> which is what made recording work the same in Safari and Chrome. My voice goes to **ElevenLabs Speech-to-Text**,
> and the text becomes the vibe. If it matches a genre we know, we add its tempo and instruments; if not, we use
> your exact words, so 'dreamy synthwave' really comes out as synthwave."

*If asked:* the producer's prompts are **ElevenLabs Text-to-Speech**, cached, and the music ducks under them;
recording is always a click, so the voice never hears your claps.

## 3. Version 1 (Alex, 25 s) · screen: "Playing v1", pill "v1 start"
> "That's **ElevenLabs Music**: 20 seconds of audio in about 3 seconds. We don't send one prompt, we send a
> **composition plan**: sections with durations, the styles we want and the styles we *ban*. For version 1 we
> deliberately ban drums, bass and melody, so it's just chords and atmosphere. That leaves room for every sound
> you add to be obvious. Each generation returns a song ID we keep, so the next version can build on this one."

## 4. Add drums: audience clap (Derik + Alex, 45 s) · screen: "Recording · 4" → "Adding drums · punchy · bright"
*Avi:* "We need a drummer. Everyone, clap with me." *Click **Add drums***, the room claps.
**Derik:**
> "Back in Daytona: we find every clap with onset detection, cut out the cleanest one, and classify it by its
> brightness: a low thump becomes a kick, a clap becomes a snare, a 'tss' a hi-hat. We also measure how *busy*,
> *punchy* and *bright* you were. That's the 'punchy · bright' on the orb."

**Alex:**
> "ElevenLabs Music can't take audio as input, so we translate those measurements into musical words
> ('busy, driving drums, punchy attacks') and regenerate the song. The first 3 seconds are conditioned on the
> previous version so it's still *your* song, and we keep banning melody so nothing random sneaks in."

**Derik** (when v2 plays):
> "And listen: that's *your* clap in the track. Daytona finds the new song's tempo and beat, and layers the clap
> we cut out on beats 2 and 4."

## 5. Add backing track (Avi, 30 s) · screen: "Adding backing · smooth · rising"
*Click **Add backing track**, hum a rising tune.*
> "I did the sound design: the table that turns what Daytona hears into musical language. A rising, smooth hum
> becomes 'smooth, legato electric piano, rising phrase', in the key from the start. We also tell the model the
> drums *keep playing*; without that, new parts used to wash the drums out. Same trick: the hum shapes the
> melody, and your clap gets mixed back in."

## 6. Versions + download + architecture (Lucas, then Alex, 25 s) · screen: dock "v1 start · v2 drums · v3 backing"
**Lucas:** *click v1, then v3*
> "Every sound you add is a new version. You can go back to any of them, and new sounds build on whichever one
> is playing. Download gives you an original, copyright-safe track."

**Alex** (one slide or just say it):
> "So: **ElevenLabs** for the music, the producer's voice and speech-to-text. **Daytona** for every piece of
> audio analysis and the final mix. A FastAPI backend in between, and Avi's RYFF interface on top."

## 7. Close (Avi, 10 s)
> "From a hum and a clap to a song in under three minutes. That's RYFF."

---

## Judge Q&A: who answers
| Question | Who | Answer |
|---|---|---|
| Is that really my clap? | Derik | Yes: cut from your recording in Daytona and layered on the detected beat. |
| Is that my exact melody? | Alex | No: your hum sets the key and shapes the melody's direction and feel. ElevenLabs Music only takes text, so we describe your sound. |
| Why does the song change a bit each version? | Alex | Each version is a fresh generation; conditioning on the previous song's opening keeps it consistent, not identical. |
| Why Daytona? | Derik | Isolated, always-warm sandbox for untrusted user audio and heavy DSP; the web server never touches raw audio. One sandbox is reused, not one per request. |
| How fast is it? | Alex | ~3 s per generation, ~1 s analysis, 7–14 s for a new version with your clap mixed in. |
| Copyright? | Avi | Everything is newly generated plus your own sounds. |
| Does it work on phones / Safari? | Lucas | Yes: raw-PCM recording through Web Audio, no MediaRecorder; any audio or video file can be uploaded instead. |

## If something breaks
- The room is too loud and the clap isn't heard → use **Upload** with the pre-recorded clap.
- A version errors → click the previous pill (it still plays) and retry.
- The UI misbehaves → `localhost:5173/?classic`.
