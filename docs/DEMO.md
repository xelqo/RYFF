# Demo: the 2-minute Loom (due 4:15)

Judges pick finalists from the Loom, so it has to be **one live conversation with the producer**, no cuts and no
faked steps. Screen + mic, headphones on, stop at 2:00. Finalists then demo live at 5:00 with the same script.

## Before you hit record
- Backend running with the pill showing **daytona: ready**; `python prewarm.py` already run.
- Fresh browser tab, mic allowed, headphones in, a quiet corner.
- Say the track, user and finish line in the first 10 seconds (below).

## Script (~2:00)
| Time | You | What the judges see |
|---|---|---|
| 0:00 | "This is Loopstack, Open track. It's for creators who need an original, copyright-safe intro beat. Done means an exported track made from their own sounds." | Title screen, then press **Talk to the producer** |
| 0:12 | "Hey! Let's make something chill, like lo-fi." | Producer replies in about a second, `set_vibe`, the beat starts |
| 0:25 | "Can I clap the snare?" → producer: "Clap a few times after I say go" → clap 3–4 times | `record_part`, "Analysing in the Daytona sandbox…", the snare chip flips to **your clap** |
| 0:45 | "Now let me hum a melody." → four clicks → hum two bars | Your tune comes back on rhodes, in key |
| 1:05 | **Interrupt it mid-sentence:** "Actually, make it trap." | `set_vibe` again: tempo, kit and key change, your clap and hum stay |
| 1:20 | "Make my clap the kick instead." | `set_part_slot`, the kick chip shows your clap |
| 1:30 | "Fill it out." | `add_backing`: producer keeps talking while the track composes |
| 1:45 | "Perfect, I'm done." | `export_song`, download button: the finish line |
| 1:55 | "Voice on ElevenLabs, every take analysed in a Daytona sandbox." | End |

The interruption at 1:05 and the change of mind are on purpose: they hit "handles being interrupted" and
"handles curveballs" in the rubric.

## If something breaks while recording
Keep going and let the producer recover (that's a curveball too). If the take fails, say "let's try that again".
Don't paste in pre-recorded audio: the rubric says no faked steps.

## Judging angles
- **Works live:** quick replies, interruptible, every step is real.
- **Solves the problem:** ends with a real WAV built from your own sounds.
- **Technical depth:** 7 client tools, pitch tracking and hit detection, ElevenLabs SFX + Music.
- **Uses Daytona:** every take is analysed by code running in a Daytona sandbox.
- **ElevenLabs prize:** tools, custom voice, English + Spanish, tuned turn-taking, knowledge base.
