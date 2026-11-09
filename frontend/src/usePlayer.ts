import { useCallback, useRef, useState } from "react";

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);

  const ensure = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      audio.addEventListener("play", () => setPlaying(true));
      audio.addEventListener("pause", () => setPlaying(false));
      audioRef.current = audio;
    }
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 128;
      ctx.createMediaElementSource(audioRef.current).connect(node);
      node.connect(ctx.destination);
      ctxRef.current = ctx;
      setAnalyser(node);
    }
    void ctxRef.current.resume();
    return audioRef.current;
  }, []);

  const play = useCallback(
    async (url: string, n: number) => {
      const audio = ensure();
      if (audio.src !== new URL(url, location.href).href) {
        audio.src = url;
        audio.currentTime = 0;
      }
      setCurrent(n);
      await audio.play();
    },
    [ensure],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    if (audioRef.current?.src) await ensure().play();
  }, [ensure]);

  const currentUrl = useCallback(() => audioRef.current?.src ?? null, []);

  // music volume (ducked under the producer's voice)
  const setVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, v));
  }, []);

  // dB spectrum of the music, the same shape as Tone.Analyser("fft").getValue()
  const fftBuf = useRef<Float32Array>(new Float32Array(64).fill(-120));
  const getFft = useCallback(() => {
    const node = analyser;
    if (node) {
      if (fftBuf.current.length !== node.frequencyBinCount) fftBuf.current = new Float32Array(node.frequencyBinCount);
      node.getFloatFrequencyData(fftBuf.current as Float32Array<ArrayBuffer>);
    }
    return fftBuf.current;
  }, [analyser]);

  return { play, pause, resume, playing, current, analyser, currentUrl, setVolume, getFft };
}
