import { useEffect, useRef } from "react";

export function Visualiser({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 64);
    let frame = 0;
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== width * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, width, height);
      if (analyser && active) analyser.getByteFrequencyData(data);
      else data.fill(0);
      const bars = 40;
      const gap = 4;
      const w = (width - gap * (bars - 1)) / bars;
      const gradient = g.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "#ff5c8a");
      gradient.addColorStop(1, "#ffb347");
      g.fillStyle = gradient;
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * data.length * 0.8)] / 255;
        const h = Math.max(4, v * height);
        g.beginPath();
        g.roundRect(i * (w + gap), height - h, w, h, w / 2);
        g.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser, active]);

  return <canvas ref={canvasRef} className="visualiser" />;
}
