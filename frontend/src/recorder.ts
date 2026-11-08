import * as Tone from "tone";

/**
 * If claps or hums land consistently early/late, tweak this (ms). Positive = the app assumes more
 * round-trip latency. Wired headphones need little; Bluetooth headphones can need 150+.
 */
export const LATENCY_NUDGE_MS = 0;

const BUFFER = 2048;

/**
 * Captures raw mic samples on Tone's own AudioContext, timestamped in that context's clock, so a take
 * can be cut exactly from the song's downbeat. Processing is off: we want the raw clap, not a cleaned-up voice.
 */
class Mic {
  private stream: MediaStream | null = null;

  async init() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  }

  /** Record between two AudioContext times (seconds). Resolves once the window has passed. */
  async capture(startAt: number, endAt: number): Promise<{ samples: Float32Array; sampleRate: number }> {
    await this.init();
    const ctx = Tone.getContext().rawContext as unknown as AudioContext;
    const src = ctx.createMediaStreamSource(this.stream!);
    const proc = ctx.createScriptProcessor(BUFFER, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    const chunks: { t: number; d: Float32Array }[] = [];
    const sr = ctx.sampleRate;
    const bufDur = BUFFER / sr;
    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      const t = Number.isFinite(e.playbackTime) ? e.playbackTime : ctx.currentTime + bufDur;
      chunks.push({ t, d: new Float32Array(e.inputBuffer.getChannelData(0)) });
    };
    src.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);

    const giveUp = endAt + 3;
    await new Promise<void>((resolve) => {
      const check = () => {
        const last = chunks[chunks.length - 1];
        const done = last && last.t - bufDur > endAt;
        if (done || ctx.currentTime > giveUp) resolve();
        else setTimeout(check, 50);
      };
      setTimeout(check, Math.max(0, (endAt - ctx.currentTime) * 1000));
    });
    proc.onaudioprocess = null;
    src.disconnect();
    proc.disconnect();
    sink.disconnect();

    // What you hear at time T reaches the speakers late, and your clap reaches us late again.
    const ctxAny = ctx as AudioContext & { outputLatency?: number };
    const latency = (ctx.baseLatency || 0) + (ctxAny.outputLatency || 0) + LATENCY_NUDGE_MS / 1000;
    const n = Math.max(1, Math.round((endAt - startAt) * sr));
    const out = new Float32Array(n);
    for (const c of chunks) {
      const offset = Math.round((c.t - bufDur - (startAt + latency)) * sr);
      for (let i = 0; i < c.d.length; i++) {
        const j = offset + i;
        if (j >= 0 && j < n) out[j] = c.d[i];
      }
    }
    return { samples: out, sampleRate: sr };
  }
}

export const mic = new Mic();
