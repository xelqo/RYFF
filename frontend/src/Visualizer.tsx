import { useEffect, useRef } from "react";
import type * as Tone from "tone";

interface Props {
  /** Agent voice frequency data (0-255), or null when not talking. */
  getAgent: () => Uint8Array | null;
  analyser: Tone.Analyser;
  countIn: number | null;
  recording: boolean;
}

/** An orb that breathes with the producer's voice, ringed by the song's spectrum. */
export default function Visualizer({ getAgent, analyser, countIn, recording }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const smooth = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.17;

      const agent = getAgent();
      let energy = 0;
      if (agent && agent.length) {
        let sum = 0;
        for (let i = 0; i < agent.length; i++) sum += agent[i];
        energy = sum / agent.length / 255;
      }
      smooth.current += (energy - smooth.current) * 0.25;

      const fft = analyser.getValue() as Float32Array;
      const n = fft.length;
      for (let i = 0; i < n; i++) {
        const v = Math.max(0, Math.min(1, (fft[i] + 100) / 70));
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r1 = base * 1.3;
        const r2 = r1 + 6 + v * base * 1.1;
        g.strokeStyle = recording ? `rgba(255,90,90,${0.2 + 0.7 * v})` : `rgba(255,255,255,${0.15 + 0.7 * v})`;
        g.lineWidth = 3;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        g.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
        g.stroke();
      }

      const r = base * (0.8 + smooth.current * 2.2);
      const grad = g.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
      grad.addColorStop(0, recording ? "rgba(255,120,120,0.95)" : "rgba(255,255,255,0.95)");
      grad.addColorStop(0.55, recording ? "rgba(255,60,60,0.35)" : "rgba(160,170,255,0.35)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getAgent, analyser, recording]);

  return (
    <div className="viz-wrap">
      <canvas ref={ref} className="viz" />
      {countIn !== null && <div className="count-in">{countIn > 0 ? countIn : "GO"}</div>}
    </div>
  );
}
