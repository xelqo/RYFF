import { useCallback, useRef, useState } from "react";

const TAKE_SECONDS = 4;
export const VIBE_SECONDS = 4;

function beep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
  return new Promise<void>((resolve) => setTimeout(resolve, 350));
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Records the mic as raw PCM through Web Audio and returns a WAV blob.
 * No MediaRecorder: Safari's MediaRecorder can return empty or undecodable audio; this works everywhere.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const record = useCallback(async (seconds: number = TAKE_SECONDS) => {
    setRecording(true);
    let stream: MediaStream | null = null;
    // Create + resume the AudioContext NOW, synchronously inside the click. Safari keeps a context created
    // after an await (permission prompt, beep) suspended, and a suspended context delivers no samples.
    const ctx: AudioContext = new AudioContext();
    const resumed = ctx.resume();
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // noise suppression would erase claps; auto gain keeps quiet mics usable
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        });
      } catch (e) {
        throw new Error(`Microphone blocked (${(e as Error).name}). Allow the mic for this site and try again.`);
      }
      await resumed.catch(() => undefined);
      await beep(ctx);
      if (ctx.state !== "running") {
        throw new Error(`The browser kept audio paused (${ctx.state}). Tap the button again; if it keeps happening, use Chrome.`);
      }
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") throw new Error("The mic track isn't live. Another app or tab may be using the mic.");
      if (track.muted) console.warn("[recorder] mic track is muted by the system/browser", track.label);
      console.info("[recorder]", { context: ctx.state, sampleRate: ctx.sampleRate, mic: track.label, settings: track.getSettings() });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0; // keeps the graph running without playing the mic back
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);

      setSecondsLeft(seconds);
      const ticker = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, seconds * 1000);
        stopRef.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      clearInterval(ticker);
      source.disconnect();
      processor.disconnect();

      const length = chunks.reduce((n, c) => n + c.length, 0);
      if (!length) {
        throw new Error(`No audio was captured (context ${ctx.state}, mic "${track.label}", muted ${track.muted}). ` +
          "Close other apps/tabs using the mic (Zoom, the producer agent) or try Chrome.");
      }
      const samples = new Float32Array(length);
      let offset = 0;
      for (const c of chunks) {
        samples.set(c, offset);
        offset += c.length;
      }
      let peak = 0;
      for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
      if (peak < 0.003) throw new Error("The mic recorded silence. Check the input device in System Settings → Sound.");
      return encodeWav(samples, ctx.sampleRate);
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      void ctx.close();
      stopRef.current = null;
      setSecondsLeft(0);
      setRecording(false);
    }
  }, []);

  const stop = useCallback(() => stopRef.current?.(), []);

  return { recording, secondsLeft, record, stop };
}
