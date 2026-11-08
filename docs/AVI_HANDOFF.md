# Avi's integration recommendations

These are proposals for the owning teammates, not changes already made to their code or the shared API.
Avi's implementation is on `sound`. See [sound notes](SOUND_NOTES.md) and [agent setup](AGENT_SETUP.md).

## Alex: rebuild part descriptions when the vibe changes

The current design retains the old part words. Those words include genre-specific instruments, so changing
lo-fi to trap could leave a rhodes instruction in the new song.

Recommended: preserve each part's original traits and recordings, then call
`traits_to_words(part.kind, part.traits, new_vibe)` for every retained part before building the new composition
plan. Omit the previous song's conditioning reference on a vibe change, as already planned. Preserve earlier
versions and their plans so history still represents what was generated at that time.

Acceptance: add a lo-fi melody, switch to trap, and inspect the new plan: the melody uses the trap instrument,
retained hits remain available, and the old version still has its original plan. No new shared fields are required.

## Derik: confirm normalized trait units

Recommended: return finite values in [0, 1] for busyness, punch, brightness and smoothness. Raw onset counts
per second, spectral Hz and pitch variation must be normalized before reaching Avi's phrase mapper.

Current thresholds: below 0.35 = low; 0.35 through 0.6 = medium; above 0.6 = high. Missing/null values use neutral
phrasing. Invalid types, NaN/infinity and error takes are rejected. Alex should handle those errors before generation.

Acceptance: a quiet/sparse take and a busy/punchy take produce meaningfully different normalized traits and words.
Please confirm normalization ranges using real takes; these thresholds have not been tuned by ear yet.

## Lucas: control both agent input and output

`micMuted` controls the microphone, not the producer's audible output.

Recommended: suppress both agent input and output while music plays or a sound is recorded. Finish the spoken
recording instructions before the beep. Restore conversation audio after recording or when Talk to producer is
pressed. Ensure stale producer speech does not resume over the song or immediately after returning to conversation.

Acceptance: no producer speech overlaps music or the take, and neither music nor claps are interpreted as speech.
Test returning to conversation and interrupting the producer as well as the happy path.

## Lucas + Alex: choose one owner for ready-version playback

`sendContextualUpdate` adds context but does not itself trigger an agent turn. The current design could therefore
wait for an agent tool call that never happens, or play twice if both the UI and agent react.

Recommended: the frontend handles automatic playback of a newly ready version once, keyed by version identity,
then informs the agent for its next conversation turn. Keep `play_version` for explicit history/user requests.
Do not automatically switch to a stale completed generation after the user has selected another version or vibe.
Agree on how the frontend identifies the current generation before changing shared response shapes.

Acceptance: readiness triggers one playback; repeated polls do not restart it; an old result does not replace a newer choice.

## Avi: live configuration and listening still pending

- Configure the producer using AGENT_SETUP.md and share ELEVENLABS_AGENT_ID with Alex.
- Select the voice by listening with the team. Keep the API key in local .env only.
- Run A/B auditions after Music access and credits are available, then record actual results in SOUND_NOTES.md.
- Confirm the event's submission/Loom deadline with the organizers; repo times are planning targets.

## What is ready on sound

Four genre presets, deterministic free-text selection, trait-to-word mappings, an offline-by-default A/B audition
script, and agent setup notes. Offline checks passed for all 16 genre/part combinations, input validation, preset
mutation isolation and A/B request construction. Audio quality, live generation and agent behavior remain unverified.

Reference: [ElevenLabs React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react).
