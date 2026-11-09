# Producer setup and acceptance checks (Avi)

Prepared configuration; not yet created in the ElevenLabs account. Use AGENT.md for the base prompt and first message.

1. Create a producer agent in the ElevenLabs dashboard; audition a warm, clear voice with short replies.
2. Paste AGENT.md's first message and prompt. Add: "After play_version returns, stay silent until the user
   returns to conversation. Never claim you heard a take unless record_sound returned traits. A generation error
   means the previous song is still available; offer retry, never announce success."
3. Add these five CLIENT tools with names matching Lucas's clientTools exactly; enable wait for response for each.

| Tool | Parameter schema | Description |
|---|---|---|
| set_vibe | required string vibe_text | Start a vibe or change the existing one, retaining recorded parts. Returns generation-start status, not ready audio. |
| record_sound | required string kind; enum drums, bass, melody, texture | Ask user to prepare, then record after the beep; return traits or error. |
| play_version | optional integer n, minimum 1 | Play a ready version; absent n means latest ready. |
| skip_part | required string kind; same enum | Skip this prompt without deleting recorded parts. |
| download_song | no parameters | Download the currently selected ready version. |

4. Give Alex the agent ID for ELEVENLABS_AGENT_ID; keep the API key server-side. Use private-agent token auth
   for the integrated app as documented in AGENT.md.
5. Check greetings and brief responses in the dashboard. Client tools require the wired app (or explicit mocks)
   to test real recording, playback and export; dashboard conversation alone does not validate these.

## Acceptance script

- Say "chill lo-fi": one set_vibe call, brief waiting line, no premature playback claim.
- Record a clap: finish instructions, mute agent input AND output, beep, record with music paused.
- Silent take: ask to retry, no invented traits, no new-version success claim.
- Skip bass: one skip_part call, ask for melody next.
- Change to dark trap: retain sounds, new generation, no claim that the old melody is already transformed.
- Ask for v1 and download: select the correct existing version and export that version.
- Generation failure: keep the prior playable song and offer retry.
- Interrupt producer speech; return from playback via Talk to producer; no speaker audio transcribed as input.

Integration decisions are tracked in SOUND_NOTES.md. micMuted controls microphone input; it is not an output mute.
sendContextualUpdate supplies context without prompting a new turn. Lucas owns implementing the chosen playback policy.
Source: https://elevenlabs.io/docs/eleven-agents/libraries/react
