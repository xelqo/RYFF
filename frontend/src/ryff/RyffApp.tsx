import { useCallback, useRef, useState } from "react";
import { api } from "../api";
import { useLoopstack } from "../useLoopstack";
import { usePlayer } from "../usePlayer";
import { useRecorder, VIBE_SECONDS } from "../useRecorder";
import { describe } from "../describe";
import type { PartKind, Version } from "../types";
import RyffVisualizer from "./RyffVisualizer";
import { useVoice } from "./useVoice";

// Avi's RYFF interface on top of the Loopstack backend (main).
// Voice is minimal: the producer only asks for the next input, once. Recording is always a click.
type Step = "welcome" | "key" | "vibe" | "studio";
const SAY = {
  key: "Hum a few notes to set the key, or skip.",
  vibe: "Now tell me your vibe.",
  parts: "Add drums or a backing track.",
} as const;
const KIND_LABEL: Record<string, string> = { drums: "drums", melody: "backing", bass: "bass", texture: "texture" };

function versionLabel(v: Version) {
  const reason = (v as Version & { reason?: string }).reason ?? "";
  if (v.n === 1) return "start";
  if (reason.startsWith("added ")) return KIND_LABEL[reason.slice(6)] ?? reason.slice(6);
  return reason === "vibe" ? "new vibe" : reason;
}

export default function RyffApp() {
  const player = usePlayer();
  const recorder = useRecorder();
  const voice = useVoice(player.setVolume);
  const [step, setStep] = useState<Step>("welcome");
  const [key, setKey] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [listening, setListening] = useState<null | "key" | "vibe" | PartKind>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const said = useRef(new Set<string>());

  const say = useCallback((k: keyof typeof SAY) => {
    if (said.current.has(k)) return;              // never repeat a prompt
    said.current.add(k);
    void voice.speak(SAY[k]);
  }, [voice]);

  const loop = useLoopstack(
    async (version) => {
      try {
        await player.play(api.fileUrl(version.url), version.n);
      } catch {
        setError(`v${version.n} is ready. Tap the orb to play it.`);
      }
      if (version.n === 1) say("parts");
    },
    () => undefined,
  );
  const { session, building, error, setError } = loop;
  const busy = Boolean(building) || recorder.recording;

  const enter = () => {
    if (step !== "welcome") return;
    setStep("key");
    say("key");
  };

  const toVibe = () => {
    setStep("vibe");
    say("vibe");
  };

  const humKey = async () => {
    if (busy) return;
    setError(null);
    voice.stop();
    setListening("key");
    try {
      const take = await recorder.record(5);
      const result = await api.detectKey(take);
      if (result.key) {
        setKey(result.key);
        toVibe();
      } else setError(result.error ?? "Couldn't hear a tune. Hum a few longer notes.");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setListening(null);
    }
  };

  const startVibe = async (text: string) => {
    const vibe = text.trim();
    if (!vibe) return;
    setError(null);
    try {
      await loop.setVibe(vibe, session ? undefined : key ?? undefined);
      setStep("studio");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  const speakVibe = async () => {
    if (busy) return;
    setError(null);
    voice.stop();
    player.pause();
    setListening("vibe");
    try {
      const take = await recorder.record(VIBE_SECONDS);
      const text = (await api.transcribe(take)).trim();
      if (!text) setError("Didn't catch that. Tap and say your vibe again.");
      else await startVibe(text);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setListening(null);
    }
  };

  const addSound = async (kind: PartKind, file?: File) => {
    const current = loop.sessionRef.current;
    if (!current || busy) return;
    setError(null);
    setHeard(null);
    voice.stop();
    player.pause();
    if (!file) setListening(kind);
    try {
      const take: Blob = file ?? (await recorder.record());
      const latest = current.versions.length;
      const from = player.current !== null && player.current !== latest ? player.current : undefined;
      const result = await api.addPart(current.id, take, kind, from);
      if ("error" in result) {
        setError(`${result.error}. Try again a bit louder.`);
        void player.resume();
        return;
      }
      const words = describe(result.part.traits).join(" · ");
      setHeard(words);
      loop.watch(`Adding ${KIND_LABEL[kind]}`, words);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setListening(null);
    }
  };

  const playVersion = async (v: Version) => {
    try {
      await player.play(api.fileUrl(v.url), v.n);
    } catch (e) {
      setError(String(e));
    }
  };

  const download = async () => {
    const versions = session?.versions ?? [];
    const v = versions.find((x) => x.n === player.current) ?? versions[versions.length - 1];
    if (!v) return;
    const blob = await (await fetch(api.fileUrl(v.url))).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ryff-v${v.n}.mp3`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const orbClick = () => {
    if (step === "welcome") return enter();
    if (step === "studio" && !busy && player.current !== null) {
      if (player.playing) player.pause();
      else void player.resume();
    }
  };

  const secs = recorder.secondsLeft;
  const orbState = recorder.recording
    ? !secs ? "Get ready"
      : listening === "key" ? `Hum now · ${secs}` : listening === "vibe" ? `Listening · ${secs}` : `Recording · ${secs}`
    : building ? `${building.label}${heard ? ` · ${heard}` : ""}`
    : step === "welcome" ? "Click to start"
    : step === "key" ? "Set the key"
    : step === "vibe" ? (key ? `Key ${key} · say your vibe` : "Say your vibe")
    : player.playing ? `Playing v${player.current}` : player.current ? "Paused · tap to play" : "Ready";

  const analyser = { getValue: player.getFft };

  return (
    <div className={`app ${session ? "has-session" : ""} ${step === "welcome" ? "welcome" : "entered"}`}>
      <main>
        <section
          className="stage"
          aria-label="RYFF studio"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--pointer-x", `${((e.clientX - r.left) / r.width - 0.5) * 24}px`);
            e.currentTarget.style.setProperty("--pointer-y", `${((e.clientY - r.top) / r.height - 0.5) * 24}px`);
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.setProperty("--pointer-x", "0px");
            e.currentTarget.style.setProperty("--pointer-y", "0px");
          }}
        >
          <RyffVisualizer
            getAgent={voice.getAgent}
            getMic={recorder.getLevel}
            analyser={analyser}
            countIn={null}
            recording={recorder.recording}
            listening={Boolean(listening)}
            expanded={Boolean(session)}
          />
          <button className="ryff-wordmark" onClick={enter} disabled={step !== "welcome"} aria-label="Enter RYFF">RYFF.</button>
          <div className="orb-anchor">
            <button
              className={`voice-orb ${recorder.recording ? "recording" : ""} ${building ? "processing" : ""} ${player.playing ? "connected" : ""}`}
              onClick={orbClick}
              aria-label={step === "studio" ? (player.playing ? "Pause" : "Play") : "Start"}
            >
              <span className="orb-core" />
              <span className="orb-glint" />
            </button>
            <div className="orb-status" role="status">{orbState}</div>

            {step !== "welcome" && (
              <div className="ryff-controls">
                {step === "key" && (
                  <>
                    <button className={`glass ${listening === "key" ? "rec" : "primary"}`} onClick={humKey} disabled={busy}>
                      <span className="dot" /> {listening === "key" ? "Humming…" : "Hum the key"}
                    </button>
                    <button className="glass" onClick={toVibe} disabled={busy}>Skip</button>
                  </>
                )}

                {(step === "vibe" || step === "studio") && (
                  <>
                    {step === "studio" && (
                      <>
                        <span className="glass-group">
                          <button className={`glass ${listening === "drums" ? "rec" : "primary"}`} onClick={() => addSound("drums")} disabled={busy}>
                            <span className="dot" /> {listening === "drums" ? "Recording…" : "Add drums"}
                          </button>
                          <label className={`glass ${busy ? "disabled" : ""}`} title="Upload a drum sound">
                            Upload
                            <input type="file" accept="audio/*,video/*" hidden disabled={busy}
                              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addSound("drums", f); }} />
                          </label>
                        </span>
                        <span className="glass-group">
                          <button className={`glass ${listening === "melody" ? "rec" : "primary"}`} onClick={() => addSound("melody")} disabled={busy}>
                            <span className="dot" /> {listening === "melody" ? "Recording…" : "Add backing track"}
                          </button>
                          <label className={`glass ${busy ? "disabled" : ""}`} title="Upload any sound for the backing track">
                            Upload
                            <input type="file" accept="audio/*,video/*" hidden disabled={busy}
                              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addSound("melody", f); }} />
                          </label>
                        </span>
                      </>
                    )}
                    <button className={`glass ${listening === "vibe" ? "rec" : step === "vibe" ? "primary" : ""}`} onClick={speakVibe} disabled={busy}>
                      <span className="dot" /> {listening === "vibe" ? "Listening…" : step === "vibe" ? "Say your vibe" : "New vibe"}
                    </button>
                    <button className="glass" onClick={() => setTyping((v) => !v)} disabled={busy}>{typing ? "Close" : "Type"}</button>
                    {step === "studio" && player.current !== null && (
                      <button className="glass" onClick={download}>Download ↓</button>
                    )}
                    {typing && (
                      <form className="ryff-type" onSubmit={(e) => { e.preventDefault(); setTyping(false); void startVibe(typed); setTyped(""); }}>
                        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="describe any vibe" />
                        <button className="glass primary" type="submit" disabled={busy}>Go</button>
                      </form>
                    )}
                  </>
                )}
                {session?.vibe && step === "studio" && (
                  <div className="heard-line">
                    {session.vibe.text}{session.vibe.key ? ` · ${session.vibe.key}` : ""}{session.vibe.bpm ? ` · ${session.vibe.bpm} BPM` : ""}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <button className="orb-error" onClick={() => setError(null)}>{error} ✕</button>}

          {session && session.versions.length > 0 && (
            <div className="parts-dock" aria-label="Versions of your song">
              {session.versions.map((v) => (
                <div key={v.n} className={`part-pill on ${player.current === v.n ? "current" : ""}`}>
                  <button className="part-toggle" onClick={() => void playVersion(v)} disabled={busy} title={`Play v${v.n}`}>
                    <span className="part-name">v{v.n}</span>
                    <span className="part-kind">{versionLabel(v)}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
