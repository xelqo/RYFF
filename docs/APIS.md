# API notes (checked against the docs on 2026-11-08; re-check anything marked ⚠︎)

## ElevenLabs
Auth header: `xi-api-key: $ELEVENLABS_API_KEY`. Python SDK: `pip install elevenlabs`.

### Sound Effects: `POST https://api.elevenlabs.io/v1/sound-generation`
| param | notes |
|---|---|
| `text` (required) | describe ONE dry sound: "single punchy 808 kick drum hit, dry, no reverb" |
| `duration_seconds` | 0.5–30. Use ~0.5 for drum hits and ~2 for a sustained instrument note |
| `loop` | `true` gives a seamless loop (texture layers) |
| `prompt_influence` | 0–1, default 0.3. Use **0.7+** for instruments so we get what we asked for |
| `model_id` | `eleven_text_to_sound_v2` (default) or `eleven_text_to_sound_v3` |
| `output_format` (query) | e.g. `mp3_44100_128`, `wav_44100` (wav may need a higher tier) |

Prompt tips: "single", "one-shot", "dry", "no reverb", "isolated". For pitched notes, name the note ("C3") and still
detect the real pitch in the sandbox (basic-pitch on the sample) before using it as a sampler root.

### Music: `POST https://api.elevenlabs.io/v1/music`
- Either `prompt` (+ `music_length_ms` 3 000–600 000, `force_instrumental`) **or** `composition_plan`, never both.
- `model_id`: `music_v1` (default), `music_v2`, `music_v2_5`.
  - v1 plan: `positive_global_styles`, `negative_global_styles`, `sections[]` with `section_name`,
    `positive_local_styles`, `negative_local_styles`, `duration_ms` (3 000–120 000), `lines`.
  - v2 plan: `chunks[]` with `text`, `duration_ms`, `positive_styles`, `negative_styles`, `context_adherence`, and
    optional `conditioning_ref` pointing at a **previously generated** song (`song_id` from the response headers).
- **No raw audio upload.** It can't take our hum or clap directly. Steer it with BPM, key and style words. The
  `conditioning_ref` trick lets a "regenerate" keep the feel of the previous backing track.
- `seed` only works with `composition_plan`.

## Daytona
Python SDK, key from env `DAYTONA_API_KEY`. ⚠︎ Confirm the package name (`pip install daytona`) and the exec/delete
method names in the SDK reference before relying on them.
```python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
sb = daytona.create(CreateSandboxFromSnapshotParams(snapshot="loopstack-audio"))  # prebuilt with our deps

sb.fs.upload_file("take.wav", "/home/daytona/take.wav")   # bytes or local path → remote path
res = sb.process.exec("python analyse.py take.wav --bpm 90 --bars 4")   # ⚠︎ check name / return fields
data = sb.fs.download_file("/home/daytona/out.wav")      # bytes (or pass a local path)
sb.process.code_run('print("hi")')                        # run a Python snippet

daytona.delete(sb)   # ⚠︎ check
```
- **Build a snapshot** with ffmpeg, rubberband-cli, librosa, basic-pitch and numpy so new sandboxes start ready. Installing
  TensorFlow per session will kill the demo.
- Keep one sandbox warm per session and reuse it for every layer.

## Libraries we'll lean on
- **Tone.js**: `Transport`, `Sampler` (pitch-shifts one sample across notes), `Player`, `Loop`. Handles the sync.
- **basic-pitch** (Spotify): audio → note events. Good on hums and whistles.
- **librosa**: onsets, `pyin` pitch, beat tracking, key estimation (chroma).
- **ffmpeg / rubberband**: trim, crossfade, time-stretch.
