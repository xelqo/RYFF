import { useEffect, useRef, useState } from "react";
import { debug, type Entry } from "./debug";
import { mic, micErrorMessage } from "./recorder";

interface Props {
  open: boolean;
  onClose: () => void;
  env: string;
}

/** Terminal-style log drawer: every error, tool call and mic event, with a mic check and copy-to-clipboard. */
export default function DebugPanel({ open, onClose, env }: Props) {
  const [entries, setEntries] = useState<Entry[]>(debug.entries);
  const [checking, setChecking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => debug.subscribe(setEntries), []);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [entries, open]);

  async function micCheck() {
    setChecking(true);
    debug.info("mic-check", "Recording 1 second… make some noise");
    try {
      debug.info("mic-check", await mic.selfTest());
    } catch (e) {
      debug.error("mic-check", micErrorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${env}\n\n${debug.text()}`);
      debug.info("debug", "Logs copied to the clipboard. Paste them to Claude.");
    } catch (e) {
      debug.error("debug", `Copy failed: ${e}`);
    }
  }

  if (!open) return null;
  return (
    <div className="debug">
      <div className="debug-bar">
        <b>error terminal</b>
        <span className="debug-env">{env}</span>
        <button onClick={micCheck} disabled={checking}>
          {checking ? "listening…" : "mic check"}
        </button>
        <button onClick={copy}>copy logs</button>
        <button onClick={() => debug.clear()}>clear</button>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="debug-log">
        {!entries.length && <p className="info">No logs yet. Errors, tool calls and mic events show up here.</p>}
        {entries.map((e, i) => (
          <p key={i} className={e.level}>
            <span className="debug-time">{new Date(e.t).toLocaleTimeString()}</span>
            <span className="debug-src">{e.source}</span>
            <span className="debug-msg">{e.msg}</span>
          </p>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
