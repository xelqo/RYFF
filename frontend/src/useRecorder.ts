import { useCallback, useRef, useState } from "react";

const TAKE_SECONDS = 4;

function beep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      void ctx.close();
      resolve();
    }, 350),
  );
}

async function toWav(blob: Blob) {
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const samples = audio.getChannelData(0);
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
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buffer], { type: "audio/wav" });
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const record = useCallback(async () => {
    setRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      await beep();
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
      recorder.start();
      setSecondsLeft(TAKE_SECONDS);
      const ticker = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
      const timer = setTimeout(() => recorder.state === "recording" && recorder.stop(), TAKE_SECONDS * 1000);
      stopRef.current = () => recorder.state === "recording" && recorder.stop();
      await done;
      clearInterval(ticker);
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      return await toWav(new Blob(chunks, { type: recorder.mimeType }));
    } finally {
      stopRef.current = null;
      setSecondsLeft(0);
      setRecording(false);
    }
  }, []);

  const stop = useCallback(() => stopRef.current?.(), []);

  return { recording, secondsLeft, record, stop };
}
