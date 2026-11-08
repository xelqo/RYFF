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

  return { play, pause, resume, playing, current, analyser, currentUrl };
}
