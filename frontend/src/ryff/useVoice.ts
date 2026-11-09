import { useCallback, useRef } from "react";
import { api } from "../api";

/**
 * The producer's voice: short spoken prompts (ElevenLabs TTS via POST /speak, cached on the server).
 * Music is ducked while it talks. getAgent() feeds the orb with the voice's spectrum.
 */
export function useVoice(duck: (volume: number) => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const buf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(32));
  const speaking = useRef(false);

  const ensure = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 64;
      ctx.createMediaElementSource(audio).connect(node);
      node.connect(ctx.destination);
      audio.addEventListener("play", () => void ctx.resume());
      audio.addEventListener("ended", () => {
        speaking.current = false;
        duck(1);
      });
      audioRef.current = audio;
      analyserRef.current = node;
    }
    return audioRef.current;
  }, [duck]);

  const speak = useCallback(
    async (text: string) => {
      try {
        const url = await api.speak(text);
        if (!url) return;
        const audio = ensure();
        audio.src = url;
        speaking.current = true;
        duck(0.25);
        await audio.play();
      } catch {
        speaking.current = false;
        duck(1);                                // a missing prompt must never block the app
      }
    },
    [duck, ensure],
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    speaking.current = false;
    duck(1);
  }, [duck]);

  const getAgent = useCallback(() => {
    if (!speaking.current || !analyserRef.current) return null;
    analyserRef.current.getByteFrequencyData(buf.current);
    return buf.current;
  }, []);

  return { speak, stop, getAgent };
}
