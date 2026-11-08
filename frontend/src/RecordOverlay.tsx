import { useEffect, useState } from "react";

export type RecordKind = "drum" | "melody" | "bass" | "texture";
export type RecState =
  | { phase: "idle" }
  | { phase: "waiting" }
  | { phase: "countin"; n: number; kind: RecordKind }
  | { phase: "recording"; kind: RecordKind; endsAt: number; total: number }
  | { phase: "analysing" };

const ACTION: Record<RecordKind, string> = {
  drum: "CLAP NOW",
  melody: "HUM NOW",
  bass: "HUM LOW NOW",
  texture: "MAKE YOUR SOUND",
};

const COUNT_HINT: Record<RecordKind, string> = {
  drum: "clap or tap when it says CLAP NOW",
  melody: "start humming on GO",
  bass: "start humming low on GO",
  texture: "start your sound on GO",
};

/** Big, unmissable record states: get ready → countdown → RECORDING (draining bar) → got it. */
export default function RecordOverlay({ rec }: { rec: RecState }) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (rec.phase !== "recording") return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [rec]);

  if (rec.phase === "idle") return null;

  if (rec.phase === "waiting") {
    return (
      <div className="rec-overlay waiting">
        <div className="rec-big">GET READY</div>
        <div className="rec-sub">the producer is finishing, then the countdown starts</div>
      </div>
    );
  }

  if (rec.phase === "countin") {
    return (
      <div className="rec-overlay countin">
        <div className="rec-count">{rec.n}</div>
        <div className="rec-sub">{COUNT_HINT[rec.kind]}</div>
      </div>
    );
  }

  if (rec.phase === "recording") {
    const left = Math.max(0, rec.endsAt - now);
    const frac = rec.total > 0 ? left / rec.total : 0;
    return (
      <div className="rec-overlay recording">
        <div className="rec-dot">● REC</div>
        <div className="rec-big">{ACTION[rec.kind]}</div>
        <div className="rec-bar">
          <div className="rec-bar-fill" style={{ width: `${frac * 100}%` }} />
        </div>
        <div className="rec-sub">{(left / 1000).toFixed(1)} s left · stop when the bar runs out</div>
      </div>
    );
  }

  return (
    <div className="rec-overlay analysing">
      <div className="rec-big">✓ GOT IT</div>
      <div className="rec-sub">recording stopped, analysing in the Daytona sandbox…</div>
    </div>
  );
}
