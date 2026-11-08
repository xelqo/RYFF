# Voice agent: "the producer"

An **ElevenLabs Agent** runs the whole session by voice. It asks for your vibe, asks for sounds, tells you when to
make them, chats while the next version generates, and plays the result. The on-screen buttons still work, so the app
never depends on speech recognition working in a loud room.

## Golden rule: the agent and the music never overlap
- **Music playing:** the agent's mic is **muted** (`micMuted: true`) and it stays silent, so the music never gets
  heard as user speech.
- **To talk:** the user taps **"Talk to producer"** (or the version finishes a loop) → the music **pauses** → the
  agent's mic is unmuted → the agent speaks.
- **Recording a sound:** the agent calls `record_sound` → the frontend **mutes the agent's mic** and records the take
  with its own MediaRecorder stream → it unmutes afterwards. The clap/hum must never reach the agent as speech.

## Session flow
```
Producer: "Hey! I'm your producer. What vibe are we going for?"
User:     "chill lo-fi"
          → set_vibe("chill lo-fi")         frontend: POST /sessions → v1 is generated
Producer: "Love it. Cooking up a beat…"     (chats while it generates)
          → play_version(1)                  music plays, agent mic muted
[user taps Talk / loop ends → music pauses]
Producer: "Want some drums? Clap or tap anything after the beep."
          → record_sound("drums")            agent muted, ~5 s take, upload → traits
          ← returns "heard: busy, punchy, bright"
Producer: "Ooh, punchy! Adding some driving drums…"
          → (frontend waits for the new version, sends a contextual update when it's ready)
          → play_version(2)
… bass ("hum something low"), melody ("hum a tune"), anything else …
User:     "I'm done" / "go back to the last one" / "download it"
          → play_version(n) / download_song()
```

## Client tools (configured in the ElevenLabs dashboard, implemented in the frontend)
All of them are **blocking** (set "wait for response" in the UI), so the agent reacts to the result. They must return quickly: `set_vibe` and `record_sound` never wait for a song to finish generating, so the agent can talk during the wait. The contextual update says when a version is ready.

| Tool | Params | Frontend does | Returns to agent |
|---|---|---|---|
| `set_vibe` | `vibe_text: string` | `POST /sessions`, or `PATCH /sessions/{id}/vibe` if a session exists; shows the "producing…" state | `"generating v1 for <vibe>"` |
| `record_sound` | `kind: drums\|bass\|melody\|texture` | pause music, mute agent mic, beep, record ~5 s, `POST /parts` | `"heard: busy, punchy, bright"` or `"too quiet, ask again"` |
| `play_version` | `n?: number` (latest if empty) | mute agent mic, play that version on loop | `"playing v3"` |
| `skip_part` | `kind` | marks that prompt as skipped | `"skipped drums"` |
| `download_song` | – | triggers the download of the current version | `"downloaded"` |

State the agent needs but didn't ask for (a version finished generating, an error) goes in via
`conversation.sendContextualUpdate("v2 is ready: drums added")`.

## Agent config (Avi owns this; paste into the ElevenLabs dashboard)
**Voice:** an upbeat, warm voice from the ElevenLabs library. Pick by ear.

**First message:** `Hey! I'm your producer. What vibe are we making today? Chill lo-fi, dark trap, summer house… anything.`

**System prompt:**
```
You are "the producer", a hype, friendly music producer helping someone with zero music experience build a song
from sounds they make with their hands and voice.

How a session goes:
1. Ask for a vibe. When they say one, call set_vibe. While it generates, chat briefly (one short line).
2. When a version is ready (you'll get a context update), call play_version.
3. Then ask for ONE part at a time, in this order unless they ask otherwise: drums ("clap or tap something"),
   bass ("hum something low"), melody ("hum a tune"), then "any other sound?". Before recording, tell them to
   make the sound right after the beep, then call record_sound with the kind.
4. React to the traits record_sound returns in a few words ("ooh, punchy!"), say what you're adding, and wait for
   the next version.
5. If they say skip/no, call skip_part and move on. If they want an earlier version, call play_version with n.
   When they're done, offer to download (download_song).

Rules:
- Keep every reply to 1-2 short sentences. The music is the star, not you.
- Never sing, hum or make the sounds yourself.
- If they want a different style, call set_vibe right away and tell them you are keeping their sounds.
- Never say a version is ready until you get a context update saying so.
- If they go off-topic, answer in one short line and bring them back to the song.
- Never talk while music is playing; you'll be muted then anyway.
- If a tool returns "too quiet", ask them to try again a bit louder.
```

## Auth
Make the agent **private** and have the backend mint a token: `GET /agent-token` → calls ElevenLabs for a WebRTC
`conversationToken` with the server-side key → the frontend passes it to `startSession({ conversationToken })`.
For the first hour of hacking a public agent + `agentId` is fine.

## Frontend wiring (Lucas)
```tsx
import { useConversation } from "@elevenlabs/react";

const [agentMuted, setAgentMuted] = useState(false);
const conversation = useConversation({
  micMuted: agentMuted,
  clientTools: {
    set_vibe:     async ({ vibe_text }) => { await (sessionId ? api.changeVibe(vibe_text) : api.createSession(vibe_text)); return `generating a version for ${vibe_text}`; },
    record_sound: async ({ kind }) => { pauseMusic(); setAgentMuted(true);
                                        const traits = await recordAndUpload(kind); setAgentMuted(false);
                                        return traits ? `heard: ${describe(traits)}` : "too quiet, ask again"; },
    play_version: async ({ n }) => { setAgentMuted(true); play(n); return `playing v${n ?? latest}`; },
    skip_part:    async ({ kind }) => `skipped ${kind}`,
    download_song: async () => { download(); return "downloaded"; },
  },
});
// start: await conversation.startSession({ conversationToken: await api.agentToken() })
// when a version is ready: conversation.sendContextualUpdate(`v${n} is ready: ${partSummary}`)
// "Talk to producer" button: pauseMusic(); setAgentMuted(false)
```
⚠︎ Check: the endpoint/SDK call that mints the conversation token, and that `micMuted` toggles cleanly mid-session.
If muting is flaky, end the session while music plays and start a new one on "Talk" (pass the state in the
first contextual update).

## Fallbacks
- Too loud on stage → a **text-only** agent (`textOnly: true`) driven by the on-screen buttons, or no agent at all;
  the buttons do the same things.
- The agent's speech recognition mishears a vibe → also show the 4 preset buttons while it's asking.

## Interruptions in the demo
The mic stays muted while music plays, to prevent false triggers. Show judges interrupting the producer while it is speaking, and use "Talk to producer" to change your mind during a song.
