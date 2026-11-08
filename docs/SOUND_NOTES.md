# Avi: sound implementation and handoff

Status: initial deterministic presets and phrase mapping implemented. No generated audio has been auditioned;
thresholds and phrase quality are provisional. No live agent has been configured or tested in this work.

## Backend contract

Matches Alex's `origin/backend:backend/contrib.py`: `vibe_from_text(text)` returns name, styles, bpm,
negative_styles and instruments; `traits_to_words(kind, traits, vibe)` returns a list of strings.
No Session/Part/Version fields were changed. Presets: lofi 80, trap 140, house 124, pop 110 BPM.
Explicit genre keywords beat mood words; unknown/empty text falls back to lo-fi. Negation is not parsed.
Numeric traits are expected normalized to 0–1. Values below 0.35 are low, above 0.6 high; missing/null is neutral.
Nonfinite/nonnumeric values and rejected takes raise ValueError; backend should reject invalid analysis before calling.

## Listening workflow

From the repository root:
```
python spikes/listen_test.py --vibe "chill lo-fi" --kind drums --trait busyness
python spikes/listen_test.py --vibe "chill lo-fi" --kind drums --trait busyness --generate
```
First command only previews JSON. Second needs ELEVENLABS_API_KEY in the process environment or a repo .env
(python-dotenv installed), and makes TWO paid 20-second generations. Outputs are in ignored spikes/out/listen-*.
Same seed, genre and neutral traits in each pair; only the selected trait changes. This isolates phrase sensitivity,
not continuity between song versions (Alex owns that test). Repeat punch/brightness, then melody smoothness.

| Preset / kind / trait | Low vs high audible? | Musical quality | Latency | Decision |
|---|---|---|---|---|
| Pending live listening | Not tested | Not tested | Not measured | Keep provisional |

## Decisions to coordinate

1. Alex: vibe changes currently keep old part words, including old instrument names. Should he re-run
   traits_to_words for retained parts against the new vibe? Recommended yes; no shared shape change needed.
2. Derik: confirm busyness/punch/brightness/smoothness are normalized to 0–1 (not raw onsets/sec or Hz).
3. Lucas: microphone muting only stops input. Suppress agent output while music/recording is active too,
   and restore output before the next conversation turn. Wait for spoken recording instructions to finish.
4. Lucas: contextual updates do not trigger an agent turn. Decide who starts ready-version playback;
   recommend frontend playback on readiness, with context supplied for the next spoken turn. Avoid double playback.
5. Avi/team: choose a voice by ear and supply the resulting agent ID; verify Music API access/credits before auditions.

References checked: [Compose music](https://elevenlabs.io/docs/api-reference/music/compose/),
[React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react).
