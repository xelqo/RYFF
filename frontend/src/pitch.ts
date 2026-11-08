/**
 * Detect the pitch of a generated instrument note (YIN), so the sampler knows its root.
 * Returns a MIDI note number, or null if the sample isn't clearly pitched (then we use a synth instead).
 */
export function detectRootMidi(buf: AudioBuffer): number | null {
  const sr = buf.sampleRate;
  const x = buf.getChannelData(0);
  const n = Math.min(4096, x.length);
  if (n < 1024) return null;
  const start = Math.min(Math.floor(0.12 * sr), x.length - n); // skip the attack
  const seg = x.subarray(start, start + n);
  const w = Math.floor(n / 2);
  const tauMin = Math.max(2, Math.floor(sr / 1000));
  const tauMax = Math.min(Math.floor(sr / 50), n - w - 1);
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let j = 0; j < w; j++) {
      const diff = seg[j] - seg[j + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let best = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < 0.2) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      best = t;
      break;
    }
  }
  if (best < 0) return null;
  const f0 = sr / best;
  const midi = Math.round(69 + 12 * Math.log2(f0 / 440));
  return midi >= 24 && midi <= 96 ? midi : null;
}
