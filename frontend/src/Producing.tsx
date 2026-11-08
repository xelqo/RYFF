import { useEffect, useState } from "react";
import type { Building } from "./useLoopstack";

export function Producing({ building }: { building: NonNullable<Building> }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [building]);

  return (
    <section className="card producing">
      <div className="eq">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
      <div>
        <div className="producing-label">{building.label}…</div>
        {building.heard && (
          <div className="heard">
            <span className="muted">We heard</span>
            {building.heard.split(" · ").map((w) => (
              <span key={w} className="trait">{w}</span>
            ))}
          </div>
        )}
        <div className="muted">Producing the next version · {seconds}s</div>
      </div>
    </section>
  );
}
