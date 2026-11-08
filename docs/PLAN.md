# Build plan

Rule: **always have something demoable.** Each milestone ends with a working app, even if ugly.

## Step 0: ElevenLabs Music tests (first ~2 hours, before any UI)
Plain Python scripts in `spikes/`. These decide whether the core idea works:
1. **Speed:** generate a 30 s lo-fi beat with `music_v2`. How long does it take? (That's the wait after every sound.)
2. **song_id:** find the header it comes back in, and check whether `store_for_inpainting` is needed to reference it.
3. **Continuity:** generate v2 with `conditioning_ref` → v1 + `"soaring rhodes melody enters"`. Is it still
   recognisably the same beat with a melody added? Try `condition_strength` high vs xhigh, with and without the same seed.
4. **Do the words matter?** Same song with "busy punchy drums" vs "sparse soft drums": can you hear the difference?
   If not, the traits do nothing, so make the words more extreme.

**Fallbacks:** if conditioning loses the beat, rely on the same seed + the same chunks with styles appended. If it's too
slow, use 15–20 s versions and pre-generate v1 for the preset vibes.

## Milestone 1: vibe → song
- [ ] 4 preset vibes (lo-fi, trap, house, pop) → styles + bpm + instrument names
- [ ] Backend: `POST /sessions` generates v1. Frontend: vibe picker → player (looping) + visualiser
- [ ] **Already a demo.**

## Milestone 2: add a sound
- [ ] Guided prompts (drums → bass → melody → anything else, all skippable)
- [ ] Record → music auto-pauses → upload → v2 plays. Traits can be faked/random at first
- [ ] Version history (go back, branch from an older version)

## Milestone 2.5: the voice producer
- [ ] Agent created in the ElevenLabs dashboard with the prompt + tools from AGENT.md (public agent first)
- [ ] Frontend wires `@elevenlabs/react`: set_vibe / record_sound / play_version / skip_part / download_song
- [ ] Mic muting: agent muted while music plays and while recording; "Talk to producer" pauses the music
- [ ] Backend `GET /agent-token`; switch the agent to private

## Milestone 3: real traits via Daytona
- [ ] `sandbox/analyse.py` (librosa: busyness, punch, brightness, pitch register, contour, smoothness)
- [ ] Daytona snapshot + one sandbox per session; `mix.py` loudness + fades
- [ ] Traits → words table tuned by ear; UI shows "we heard: busy · punchy · bright"

## Milestone 4: polish
- [ ] Free-text vibes (keyword map to the genre table; small LLM call optional)
- [ ] Download, nicer visuals, loading animation during generation

## Cut list (in this order)
free-text vibes (keep presets) → branching history (keep linear undo) → real traits (fall back to fixed words per
kind; but then Daytona only does mixing, so keep traits if at all possible).
**Never cut the voice agent** (it's a hackathon requirement). Worst case, fall back to a text-only agent plus the buttons.

## Out of scope (decided)
- Changing the vibe mid-session
- Exact use of the user's rhythm or melody (it's loose inspiration)
- Recording while music plays
- Our own audio engine / layering / tempo sync
