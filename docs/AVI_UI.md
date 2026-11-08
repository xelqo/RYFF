# Avi UI integration

Desktop voice-only Loopstack UI: one floating glass orb connects/disconnects the producer. The orb and full-screen Siri-colored field react to local mic RMS, producer output, and Tone music FFT. Count-in and recording states remain visible; voice export reveals a download link. The backtick key opens diagnostics.

## Integrating into main

This branch is based on Derrick's local Tone playback architecture and includes origin/derrick through 84eb33b. Current origin/main (92451ef at verification) still uses the earlier frontend/API architecture. Merge the complete Avi UI branch with the corresponding Derrick backend/audio changes; do not copy App.tsx alone into the older main frontend. Resolve architecture conflicts in favor of the current Session/kit/parts contract while preserving any newer team fixes. Main was not modified by this work.

Frontend requires VITE_ELEVENLABS_AGENT_ID in frontend/.env. API credentials remain in the root .env. Neither env file is committed.

## Verification

- npm run build: TypeScript and production Vite build pass (existing large-bundle warning).
- node --test tests/mic-level.test.cjs: four tests pass for permission timing, immediate meter response/clamping, stream reuse/no speaker connection, and inactive input.
- Desktop orb view visually inspected. Header, footer, composer, and manual drawer removed.
- Earlier session transition/pause checked using a temporary browser-only fixture, then restored to real backend.
- Real microphone/ElevenLabs/Daytona recording and WAV export require end-to-end testing with the configured backend. Backend was offline during UI checks.
- Latest Derrick recording changes retained: producer silencing during takes, drum countdown beeps, click-only humming default, completion chime, capture normalization, and analysis changes. Recording state is presented through the orb/count-in rather than the old full-screen recording panel.
