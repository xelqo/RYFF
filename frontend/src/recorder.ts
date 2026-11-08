import * as Tone from "tone";
import { debug } from "./debug";

/**
 * If claps or hums land consistently early/late, tweak this (ms). Positive = the app assumes more
 * round-trip latency. Wired headphones need little; Bluetooth headphones can need 150+.
 */
export const LATENCY_NUDGE_MS = 0;

const BUFFER = 2048;

const HINTS: Record<string, string> = {
  NotAllowedError:
    "Mic permission is blocked. Click the icon left of the address bar → Microphone → Allow, and check macOS System Settings → Privacy & Security → Microphone → Google Chrome is on. Then reload.",
  NotFoundError: "No microphone found. Plug one in, or pick an input in macOS System Settings → Sound → Input.",
  NotReadableError:
    "The mic is busy or blocked by macOS. Close Zoom, FaceTime, Discord or other tabs using it, then try again.",
  OverconstrainedError: "The mic doesn't support the requested settings.",
  SecurityError: "The mic only works on http://localhost or https.",
  AbortError: "The mic failed to start. Unplug/replug it or pick another input, then reload.",
};

/** A readable message (with a fix) for any mic error. */
export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  return HINTS[name] ? `${name}: ${HINTS[name]}` : msg;
}

function peakOf(x: Float32Array) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

/**
 * Captures raw mic samples, timestamped, so a take can be cut exactly from the song's downbeat.
 * Tone.js's own AudioContext can't create ScriptProcessors, so capture runs on a separate native
 * AudioContext and its clock is mapped onto Tone's.
 */
class Mic {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private meter: AnalyserNode | null = null;
  private meterSource: MediaStreamAudioSourceNode | null = null;
  private meterData = new Float32Array(256);

  /** Local-only input level, read by the visualizer; never records or uploads. */
  getLevel(): number {
    if (!this.meter || this.ctx?.state !== "running" || !this.stream?.active) return 0;
    this.meter.getFloatTimeDomainData(this.meterData);
    let energy = 0;
    for (const value of this.meterData) energy += value * value;
    return Math.min(1, Math.sqrt(energy / this.meterData.length) * 10);
  }

  async init() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser can't access the mic here. Use Chrome on http://localhost:5173.");
    }
    const live = this.stream?.getAudioTracks().some((t) => t.readyState === "live");
    if (!live) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        debug.warn("mic", `Raw mic settings failed (${micErrorMessage(e)}). Retrying with default settings.`);
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e2) {
          const m = micErrorMessage(e2);
          debug.error("mic", m);
          throw new Error(m);
        }
      }
      const track = this.stream.getAudioTracks()[0];
      debug.info("mic", `Using "${track?.label || "default microphone"}" ${JSON.stringify(track?.getSettings?.() ?? {})}`);
      track?.addEventListener("ended", () => debug.warn("mic", "The mic stopped (unplugged, or permission was revoked)."));
    }
    if (!this.ctx || this.ctx.state === "closed") {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      debug.info("mic", `Capture audio context: ${this.ctx.sampleRate} Hz`);
    }
    if (!this.meter || !live || this.meter.context !== this.ctx) {
      this.meterSource?.disconnect();
      this.meter?.disconnect();
      this.meter = this.ctx.createAnalyser();
      this.meter.fftSize = 256;
      this.meterSource = this.ctx.createMediaStreamSource(this.stream!);
      this.meterSource.connect(this.meter); // No connection to speakers: no mic feedback.
    }
    if (this.ctx.state !== "running") {
      await this.ctx.resume().catch((e) => debug.warn("mic", `Couldn't resume capture audio: ${e}`));
    }
  }

  /** Record between two times on Tone's clock (seconds). Resolves once the window has passed. */
  async capture(startAt: number, endAt: number): Promise<{ samples: Float32Array; sampleRate: number }> {
    await this.init();
    const ctx = this.ctx!;
    if (ctx.state !== "running") {
      throw new Error(`Capture audio is "${ctx.state}". Click anywhere on the page, then try recording again.`);
    }
    // Map Tone's clock onto the capture context's clock.
    const offset = ctx.currentTime - Tone.getContext().currentTime;
    const start = startAt + offset;
    const end = endAt + offset;

    const src = ctx.createMediaStreamSource(this.stream!);
    const proc = ctx.createScriptProcessor(BUFFER, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    const sr = ctx.sampleRate;
    const bufDur = BUFFER / sr;
    const chunks: { t: number; d: Float32Array }[] = [];
    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      const t = Number.isFinite(e.playbackTime) ? e.playbackTime : ctx.currentTime + bufDur;
      chunks.push({ t, d: new Float32Array(e.inputBuffer.getChannelData(0)) });
    };
    src.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);

    const giveUp = end + 3;
    await new Promise<void>((resolve) => {
      const check = () => {
        const last = chunks[chunks.length - 1];
        if ((last && last.t - bufDur > end) || ctx.currentTime > giveUp) resolve();
        else setTimeout(check, 50);
      };
      setTimeout(check, Math.max(0, (end - ctx.currentTime) * 1000));
    });
    proc.onaudioprocess = null;
    src.disconnect();
    proc.disconnect();
    sink.disconnect();

    if (!chunks.length) {
      throw new Error("The mic produced no audio. Click the page once, check the mic is allowed, then try again.");
    }
    // What you hear at time T reaches the speakers late, and your sound reaches us late again.
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + LATENCY_NUDGE_MS / 1000;
    const n = Math.max(1, Math.round((end - start) * sr));
    const out = new Float32Array(n);
    for (const c of chunks) {
      const o = Math.round((c.t - bufDur - (start + latency)) * sr);
      for (let i = 0; i < c.d.length; i++) {
        const j = o + i;
        if (j >= 0 && j < n) out[j] = c.d[i];
      }
    }
    const peak = peakOf(out);
    debug.info("mic", `Captured ${(n / sr).toFixed(2)} s, ${chunks.length} chunks, peak level ${peak.toFixed(3)}`);
    if (peak < 0.003) {
      debug.warn("mic", "That take is silent. Check the input device and level in macOS System Settings → Sound → Input.");
    }
    return { samples: out, sampleRate: sr };
  }

  /** 1-second level check for the debug panel. */
  async selfTest(): Promise<string> {
    const now = Tone.getContext().currentTime;
    const { samples } = await this.capture(now + 0.05, now + 1.05);
    const peak = peakOf(samples);
    if (peak < 0.003) return `Mic check: SILENT (peak ${peak.toFixed(4)}). Wrong input device, muted mic, or blocked permission.`;
    if (peak < 0.05) return `Mic check: very quiet (peak ${peak.toFixed(3)}). Move closer or raise the input level.`;
    return `Mic check: OK (peak ${peak.toFixed(3)}).`;
  }
}

export const mic = new Mic();
