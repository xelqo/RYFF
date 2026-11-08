# API notes (checked against the docs on 2026-11-08; re-check anything marked ⚠︎)

> **Shipped build (2:00 PM):** ElevenLabs = the agent + Sound Effects (every kit and instrument sound) + Music
> (optional backing track, simple `prompt` request in `backend/eleven.py`). The composition-plan / `conditioning_ref`
> notes below are kept for reference; the shipped build doesn't depend on them.

## ElevenLabs Music (the core): `POST https://api.elevenlabs.io/v1/music`
Auth header `xi-api-key: $ELEVENLABS_API_KEY`. Python SDK: `pip install elevenlabs`.

- Send either `prompt` (+ `music_length_ms`, `force_instrumental`) **or** `composition_plan`, never both. We use
  `composition_plan` because `seed` and `conditioning_ref` only work with it.
- `model_id`: use `music_v2` or `music_v2_5` (v2 plans use `chunks`).
- Chunk fields: `text` (bracketed section name + `{curly directions}`), `duration_ms` (3 000–120 000, always
  enforced on v2), `positive_styles`, `negative_styles`, `context_adherence` (`low|medium|high`, default high),
  `conditioning_ref`, `condition_strength` (`low|medium|high|xhigh`).
- `conditioning_ref` = `{ "song_id": "...", "range": { "start_ms": 0, "end_ms": 10000 } }`, a **previously generated**
  song. The first chunk's reference influences every later chunk.
- ⚠︎ The `song_id` comes back in a **response header**; the docs don't name it, so print all headers on the first call.
- ⚠︎ Set `store_for_inpainting: true` on every generation in case referencing later requires it. Verify in step 0.
- `output_format` query param, e.g. `mp3_44100_128`.
- No raw audio upload: the user's sounds reach the model only as words.

```json
{
  "model_id": "music_v2",
  "seed": 1234,
  "store_for_inpainting": true,
  "composition_plan": { "chunks": [
    { "text": "[Intro]\n{beat continues}", "duration_ms": 8000,
      "positive_styles": ["chill lo-fi hip hop", "80 BPM", "instrumental", "laid-back sparse drums"],
      "negative_styles": ["vocals", "singing"],
      "conditioning_ref": { "song_id": "<previous>", "range": { "start_ms": 0, "end_ms": 10000 } },
      "condition_strength": "high" },
    { "text": "[Main]\n{a soaring, rising rhodes melody enters}", "duration_ms": 22000,
      "positive_styles": ["chill lo-fi hip hop", "80 BPM", "instrumental", "laid-back sparse drums",
                          "soaring rising rhodes melody"],
      "negative_styles": ["vocals", "singing"] }
  ]}
}
```

## ElevenLabs Agents (the voice "producer")
- React SDK: `npm i @elevenlabs/react` → `useConversation({ clientTools, micMuted, onMessage, … })`.
- `startSession({ agentId })` for a public agent, or `{ conversationToken }` (WebRTC) / `{ signedUrl }` (WebSocket)
  minted server-side for a private one. `endSession()`, `setVolume({ volume })`.
- `sendContextualUpdate(text)` gives the agent info without making it reply; `sendUserMessage(text)` makes it reply.
- Client tools: keys in `clientTools` must match tool names configured in the dashboard; the returned value is sent
  back to the agent. Mark tools as **blocking** in the dashboard so the agent waits for the result.
- `textOnly: true` runs it without the mic (fallback).
- ⚠︎ Look up the exact server endpoint for minting a conversation token.
- Full design + system prompt: [AGENT.md](AGENT.md).

## ElevenLabs extras (optional)
- **Sound Effects** `POST /v1/sound-generation` (`text`, `duration_seconds` 0.5–30, `loop`, `prompt_influence`):
  a UI "ding" or a texture preview. Not needed for the core.

## Daytona
Python SDK, key from env `DAYTONA_API_KEY`. `pip install daytona` and `from daytona import Daytona` are confirmed by
the event deck (slide 13). `sandbox.process.exec(cmd)` returns `.exit_code` and `.result`;
`sandbox.fs.upload_file(bytes, path)` / `download_file(path) -> bytes`. Used in `backend/runners.py`, which falls back
gracefully if `CreateSandboxFromSnapshotParams` or `sandbox.delete()` differ. **The shipped build needs no snapshot:**
`sandbox/analyse.py` is numpy-only.
```python
from daytona import Daytona, CreateSandboxFromSnapshotParams
daytona = Daytona()
sb = daytona.create(CreateSandboxFromSnapshotParams(snapshot="loopstack-audio"))  # librosa + ffmpeg preinstalled
sb.fs.upload_file("take.wav", "/home/daytona/take.wav")
res = sb.process.exec("python analyse.py take.wav --kind melody")   # ⚠︎ check name / return fields
data = sb.fs.download_file("/home/daytona/out.mp3")
daytona.delete(sb)                                                  # ⚠︎ check
```
- Build the snapshot early (librosa, soundfile, ffmpeg). Reuse one sandbox per session.
