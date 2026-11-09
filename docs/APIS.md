# API notes (checked against the docs on 2026-11-08; re-check anything marked ⚠︎)

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
- The `song_id` comes back in the **`song-id` response header** (verified in step 0).
- We send `store_for_inpainting: true` on every generation; referencing with it works. (Without it: untested.)
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

## Step 0 results (2026-11-08, Alex): GO
Test files in `spikes/out/` (gitignored, on Alex's laptop). Numbers are rough spectral measures; **confirm by ear**.
- **Speed:** a 20 s `music_v2` track takes **~2.5 s**. The wait after each sound is tiny.
- **Words matter:** "driving busy punchy drums" vs "very sparse soft brushed drums" (same seed): onsets 2.45/s vs
  0.80/s, high-frequency energy 0.16 vs 0.03. Traits → words will be audible.
- **Conditioning drowns out new parts.** With an 8 s conditioned intro (high/medium/low strength) v2 is ~0.93–0.98
  similar to v1, and added "busy drums" did NOT show up (onsets unchanged).
- **No conditioning + same seed:** busy drums came through (2.35 vs 1.15 onsets/s), similarity to v1 ~0.77–0.83.
- **Chosen default (`CONDITION_MODE=short`):** a 3 s conditioned intro + main chunk with `context_adherence: low`.
  The intro matches v1 (0.98) and the new part lands strongly (2.87 onsets/s), but the main section is quite
  different from v1 (0.32): it plays like "old beat, then the new part drops in". With `medium` adherence the part
  barely shows (1.43/s).
- To compare by ear: `c_v1.mp3` → `c_v2_short_low.mp3` (default) vs `b_v2_drums_nocond.mp3` (`CONDITION_MODE=none`).

## ElevenLabs extras (optional)
- **Sound Effects** `POST /v1/sound-generation` (`text`, `duration_seconds` 0.5–30, `loop`, `prompt_influence`):
  a UI "ding" or a texture preview. Not needed for the core.

## Daytona
Python SDK, key from env `DAYTONA_API_KEY`. ⚠︎ Confirm the package name (`pip install daytona`) and the exec/delete
names in the SDK reference.
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
