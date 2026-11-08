import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import * as api from "./api";
import { engine } from "./engine";
import { mic } from "./recorder";
import { encodeWav } from "./wav";
import Visualizer from "./Visualizer";
import DebugPanel from "./DebugPanel";
import { debug, fmt } from "./debug";
import { SLOTS, type Health, type Part, type Session, type Slot } from "./types";

const AGENT_ID = (import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined)?.trim();
const PRESETS = ["chill lo-fi", "dark trap", "summer house", "90s boom bap", "happy pop", "dreamy ambient"];
const HIT_SECONDS = 3;
const HUM_STEPS = 32; // hums and textures are 2 bars, looped
const PRE_ROLL = 0.15;

type Line = { who: "you" | "producer" | "app"; text: string };
type RecordKind = "drum" | "melody" | "bass" | "texture";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function normalizeKind(raw: string): { kind: RecordKind; slot?: Slot } {
  const k = (raw || "").toLowerCase();
  const slot = SLOTS.find((s) => k.includes(s));
  if (/bass|low/.test(k)) return { kind: "bass" };
  if (/hum|melod|whistle|sing|tune|lead|la la|da da/.test(k)) return { kind: "melody" };
  if (/textur|ambien|noise|atmos|background|keys|rain|loop/.test(k)) return { kind: "texture" };
  return { kind: "drum", slot }; // claps, taps, beatbox, snaps, "kick", "hat"...
}

function findPart(s: Session, query: string): Part | undefined {
  const q = (query || "").trim().toLowerCase();
  const parts = [...s.parts].reverse(); // most recent first
  if (!q) return parts[0];
  return (
    parts.find((p) => p.name === q) ??
    parts.find((p) => p.name.includes(q) || q.includes(p.name)) ??
    parts.find((p) => q.includes(p.kind) || (p.slot && q.includes(p.slot))) ??
    parts.find((p) => (/hum|melod|tune/.test(q) && p.kind === "melody") || (/clap|drum|hit/.test(q) && p.kind === "drum"))
  );
}

function describe(s: Session): string {
  const v = s.vibe;
  const parts = s.parts.map((p) => {
    const what = p.kind === "drum" ? `drum on the ${p.slot}` : p.kind;
    return `"${p.name}" (${what}${p.muted ? ", muted" : ""})`;
  });
  return `Song: ${v.label}, ${v.bpm} BPM, ${v.key}. Parts: ${parts.length ? parts.join(", ") : "none yet"}.`;
}

/** Registers an agent client tool and logs every call in the error terminal. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useTool(name: string, handler: (p: any) => string | Promise<string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useConversationClientTool(name, (p: any) => {
    debug.info("tool", `producer called ${name}(${fmt(p ?? {})})`);
    return handler(p);
  });
}

export default function App() {
  return (
    <ConversationProvider>
      <Studio />
    </ConversationProvider>
  );
}

function Studio() {
  const [session, setSessionState] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [status, setStatus] = useState("");
  const [countIn, setCountIn] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [exported, setExported] = useState<{ url: string; seconds: number } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vibeInput, setVibeInput] = useState("");
  const [transport, setTransport] = useState<"started" | "paused" | "stopped">("stopped");
  const [quietWhileTalking, setQuietWhileTalking] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [micPermission, setMicPermission] = useState("unknown");
  const busy = useRef(false);

  const log = useCallback((who: Line["who"], text: string) => {
    setLines((ls) => [...ls.slice(-40), { who, text }]);
  }, []);

  const conversation = useConversation({
    onConnect: () => {
      log("app", "Producer connected. Say hi!");
      debug.info("agent", "Connected");
    },
    onDisconnect: () => {
      log("app", "Producer disconnected.");
      debug.info("agent", "Disconnected");
    },
    onError: (e: unknown) => {
      setError(`Agent: ${errMsg(e)}`);
      debug.error("agent", fmt(e));
    },
    onMessage: (m: unknown) => {
      const msg = m as { message?: string; source?: string; role?: string };
      if (msg?.message) log(msg.source === "user" || msg.role === "user" ? "you" : "producer", msg.message);
    },
  });
  const convRef = useRef(conversation);
  convRef.current = conversation;
  const connected = conversation.status === "connected";

  // ------------------------------------------------------------ state helpers
  const setSession = (s: Session | null) => {
    sessionRef.current = s;
    setSessionState(s);
  };

  async function apply(s: Session) {
    await engine.loadSession(s);
    setSession(s);
    engine.play(s);
  }

  async function waitForAgentToFinish() {
    const until = Date.now() + 6000;
    while (convRef.current.isSpeaking && Date.now() < until) await sleep(100);
    await sleep(250);
  }

  function setAgentMic(muted: boolean) {
    try {
      convRef.current.setMuted(muted);
    } catch {
      /* not connected */
    }
  }

  function tellAgent(text: string) {
    try {
      if (convRef.current.status === "connected") convRef.current.sendContextualUpdate(text);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ actions (used by the agent AND the buttons)
  async function setVibe(text: string): Promise<string> {
    const vibeText = (text || "").trim() || "chill lo-fi";
    setStatus(`Building a ${vibeText} kit with ElevenLabs…`);
    try {
      await Tone.start();
      const cur = sessionRef.current;
      const s = cur ? await api.changeVibe(cur.id, vibeText) : await api.createSession(vibeText);
      await apply(s);
      setExported(null);
      const warn = s.warnings?.length ? ` (Some sounds fell back to synths: ${s.warnings.length} failed.)` : "";
      return `Vibe set. The beat is playing.${warn} ${describe(s)}`;
    } finally {
      setStatus("");
    }
  }

  async function recordPart(kindRaw: string, name?: string): Promise<string> {
    if (busy.current) return "Already recording. Wait for this take to finish.";
    busy.current = true;
    const { kind, slot } = normalizeKind(kindRaw);
    try {
      await Tone.start();
      if (!sessionRef.current) await setVibe("chill lo-fi");
      const s = sessionRef.current!;
      await waitForAgentToFinish();
      setAgentMic(true); // otherwise the agent hears your clap as an interruption
      setRecording(true);
      let take: { samples: Float32Array; sampleRate: number };
      let preRoll = 0;
      let steps = HUM_STEPS;
      if (kind === "drum") {
        engine.stop(); // record the hit clean, without the beat bleeding in
        setCountIn(0);
        setStatus(`Recording for ${HIT_SECONDS} seconds: make your sound a few times`);
        const start = Tone.now() + 0.05;
        take = await mic.capture(start, start + HIT_SECONDS);
      } else {
        preRoll = PRE_ROLL;
        steps = HUM_STEPS;
        engine.duck(false); // the beat must be audible while you hum along
        setStatus("Count-in… then go on the 1");
        const downbeat = engine.playWithCountIn(s, (n) => setCountIn(n));
        const recSeconds = steps * (60 / s.vibe.bpm / 4);
        take = await mic.capture(downbeat - preRoll, downbeat + recSeconds + 0.2);
      }
      setRecording(false);
      setCountIn(null);
      setAgentMic(false);
      setStatus("Analysing your take in the Daytona sandbox…");
      debug.info("record", `Uploading ${kind} take (${(take.samples.length / take.sampleRate).toFixed(1)} s) for analysis`);
      const wav = encodeWav([take.samples], take.sampleRate);
      const res = await api.addPart(s.id, wav, { kind, name, slot, preRoll, steps });
      busy.current = false;
      await apply(res.session);
      const p = res.part;
      const what =
        p.kind === "drum"
          ? `Their sound is now the ${p.slot} in the beat`
          : p.kind === "texture"
            ? "It's looping as a background texture"
            : `It's playing as a ${p.kind} line with ${p.notes?.length ?? 0} notes, snapped to ${res.session.vibe.key}`;
      return `Added "${p.name}". ${what}. ${describe(res.session)}`;
    } catch (e) {
      debug.error("record", `${kind} take failed: ${fmt(e)}`);
      if (sessionRef.current) engine.play(sessionRef.current);
      return `That take didn't work: ${errMsg(e)}`;
    } finally {
      busy.current = false;
      setRecording(false);
      setCountIn(null);
      setAgentMic(false);
      setStatus("");
    }
  }

  async function patchPart(query: string, patch: { slot?: string; muted?: boolean }, verb: string): Promise<string> {
    const s = sessionRef.current;
    if (!s) return "There's no song yet. Set a vibe first.";
    const p = findPart(s, query);
    if (!p) return `I couldn't find a part called "${query}". ${describe(s)}`;
    if (patch.slot && !SLOTS.includes(patch.slot as Slot)) return `Slot must be one of: ${SLOTS.join(", ")}.`;
    const ns = await api.updatePart(s.id, p.id, patch);
    await apply(ns);
    return `${verb} "${p.name}". ${describe(ns)}`;
  }

  async function removePart(query: string): Promise<string> {
    const s = sessionRef.current;
    if (!s) return "There's no song yet.";
    const p = findPart(s, query);
    if (!p) return `I couldn't find a part called "${query}". ${describe(s)}`;
    const ns = await api.removePart(s.id, p.id);
    await apply(ns);
    return `Removed "${p.name}". ${describe(ns)}`;
  }

  async function addBacking(style?: string) {
    const s = sessionRef.current;
    if (!s) {
      tellAgent("The backing track wasn't made because no vibe is set yet.");
      return;
    }
    setStatus("Composing a backing track with ElevenLabs Music…");
    log("app", "Composing a backing track…");
    try {
      const ns = await api.addBacking(s.id, style);
      while (busy.current) await sleep(200); // never restart the loop in the middle of a take
      await apply(ns);
      log("app", "Backing track is in.");
      tellAgent("The backing track is ready and now playing under the beat.");
    } catch (e) {
      log("app", `Backing track failed: ${errMsg(e)}`);
      tellAgent(`The backing track failed: ${errMsg(e)}`);
    } finally {
      setStatus("");
    }
  }

  function pauseMusic(): string {
    if (!engine.running) return "The music is already paused.";
    engine.pause();
    return "Music paused.";
  }

  function resumeMusic(): string {
    const s = sessionRef.current;
    if (!s) return "There's no song yet. Set a vibe first.";
    if (engine.paused) engine.resume();
    else if (!engine.running) engine.play(s);
    return "Music is playing again.";
  }

  function togglePlay() {
    log("app", engine.running ? pauseMusic() : resumeMusic());
  }

  async function exportSong(): Promise<string> {
    const s = sessionRef.current;
    if (!s) return "There's no song yet. Set a vibe first.";
    setStatus("Rendering your track…");
    try {
      const { blob, seconds } = await engine.exportMix(s, 15);
      setExported((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { url: URL.createObjectURL(blob), seconds };
      });
      return `Exported a ${Math.round(seconds)}-second track. The download button is on screen. That's the finish line.`;
    } finally {
      setStatus("");
    }
  }

  // ------------------------------------------------------------ client tools for the ElevenLabs agent
  const safe = async (fn: () => Promise<string>) => {
    try {
      const out = await fn();
      log("app", out);
      return out;
    } catch (e) {
      const out = `Error: ${errMsg(e)}`;
      debug.error("tool", fmt(e));
      log("app", out);
      return out;
    }
  };

  useTool("set_vibe", (p: { vibe?: string }) => safe(() => setVibe(String(p?.vibe ?? ""))));
  useTool("record_part", (p: { kind?: string; name?: string }) =>
    safe(() => recordPart(String(p?.kind ?? "drum"), p?.name ? String(p.name) : undefined)),
  );
  useTool("set_part_slot", (p: { part?: string; slot?: string }) =>
    safe(() => patchPart(String(p?.part ?? ""), { slot: String(p?.slot ?? "").toLowerCase() }, "Moved")),
  );
  useTool("mute_part", (p: { part?: string; muted?: boolean | string }) => {
    const muted = !(p?.muted === false || p?.muted === "false");
    return safe(() => patchPart(String(p?.part ?? ""), { muted }, muted ? "Muted" : "Unmuted"));
  });
  useTool("remove_part", (p: { part?: string }) => safe(() => removePart(String(p?.part ?? ""))));
  useTool("add_backing", (p: { style?: string }) => {
    void addBacking(p?.style ? String(p.style) : undefined);
    return "Composing the backing track now. It will fade in by itself in about 20 to 40 seconds.";
  });
  useTool("export_song", () => safe(exportSong));
  useTool("pause_music", () => safe(async () => pauseMusic()));
  useTool("resume_music", () => safe(async () => resumeMusic()));

  // Music fades out while the producer talks, so voice and beat never fight (and the mic doesn't hear the beat).
  useEffect(() => {
    engine.duck(quietWhileTalking && connected && conversation.isSpeaking);
  }, [quietWhileTalking, connected, conversation.isSpeaking]);

  // Keep the play/pause button in sync with the transport (the agent can pause too).
  useEffect(() => {
    const id = setInterval(() => {
      setTransport(engine.running ? "started" : engine.paused ? "paused" : "stopped");
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Error terminal: count errors and pop it open when something goes wrong.
  useEffect(() => {
    let seen = debug.entries.length;
    return debug.subscribe((entries) => {
      const fresh = entries.slice(Math.min(seen, entries.length));
      seen = entries.length;
      const errors = fresh.filter((e) => e.level === "error").length;
      if (errors) {
        setErrorCount((c) => c + errors);
        setDebugOpen(true);
      }
    });
  }, []);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setMicPermission(status.state);
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.onchange = () => {
          update();
          debug.info("mic", `Mic permission is now "${s.state}"`);
        };
      })
      .catch(() => setMicPermission("unknown"));
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  const lastSandbox = useRef<string | null>(null);
  useEffect(() => {
    const now = health ? `${health.mode}/${health.sandbox}` : "offline";
    if (now === lastSandbox.current) return;
    lastSandbox.current = now;
    if (!health) debug.error("backend", "Backend offline: start it with uvicorn main:app --reload --port 8000");
    else if (health.sandbox === "error" || health.sandbox === "no-key")
      debug.error("daytona", `Sandbox ${health.sandbox}: ${health.sandbox_error ?? ""}`);
    else debug.info("daytona", `Analysis mode: ${health.mode} (sandbox ${health.sandbox})`);
    if (health && !health.elevenlabs) debug.error("elevenlabs", "ELEVENLABS_API_KEY is missing from the root .env");
  }, [health]);

  // Spacebar = play/pause (unless you're typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "`" && tag !== "INPUT") {
        setDebugOpen((o) => !o);
        return;
      }
      if (e.code !== "Space" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || busy.current) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ------------------------------------------------------------ effects
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const h = await api.health();
        if (alive) setHealth(h);
      } catch {
        if (alive) setHealth(null);
      }
    };
    void poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    engine.onPulse = (key) => {
      document.getElementById(`pulse-${key}`)?.animate(
        [
          { transform: "scale(1.06)", filter: "brightness(1.9)" },
          { transform: "scale(1)", filter: "brightness(1)" },
        ],
        { duration: 160, easing: "ease-out" },
      );
    };
    return () => {
      engine.onPulse = null;
    };
  }, []);

  const getAgent = useCallback(() => {
    try {
      return convRef.current.status === "connected" ? convRef.current.getOutputByteFrequencyData() : null;
    } catch {
      return null;
    }
  }, []);

  async function toggleTalk() {
    setError(null);
    if (connected) {
      await conversation.endSession();
      return;
    }
    if (!AGENT_ID) {
      setError("Set VITE_ELEVENLABS_AGENT_ID in frontend/.env, then restart npm run dev.");
      return;
    }
    try {
      await Tone.start();
      await mic.init();
      await conversation.startSession({ agentId: AGENT_ID });
    } catch (e) {
      setError(`Couldn't start the producer: ${errMsg(e)}`);
    }
  }

  const manual = (fn: () => Promise<string>) => () => void safe(fn);

  // ------------------------------------------------------------ UI
  const v = session?.vibe;
  const sandboxLabel = !health
    ? "backend offline"
    : health.mode === "daytona"
      ? `daytona: ${health.sandbox}`
      : health.mode === "local"
        ? "local analysis (dev only)"
        : `daytona: ${health.sandbox}`;

  return (
    <div className="app">
      <header>
        <div className="brand">
          LOOPSTACK<span>.</span>
        </div>
        <div className="vibe-info">{v ? `${v.label} · ${v.bpm} BPM · ${v.key}` : "no vibe yet"}</div>
        <div className={`pill ${health?.mode === "daytona" && health.sandbox === "ready" ? "ok" : "warn"}`} title={health?.sandbox_error ?? ""}>
          {sandboxLabel}
        </div>
        <button
          className={`logs ${errorCount ? "has-errors" : ""}`}
          onClick={() => {
            setDebugOpen((o) => !o);
            setErrorCount(0);
          }}
          title="Error terminal (`)"
        >
          logs{errorCount ? ` · ${errorCount}` : ""}
        </button>
        <button className={`talk ${connected ? "on" : ""}`} onClick={toggleTalk}>
          {connected ? (conversation.isSpeaking ? "Producer talking… (end)" : "Listening… (end)") : "Talk to the producer"}
        </button>
      </header>

      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <main>
        <section className="stage">
          <Visualizer getAgent={getAgent} analyser={engine.analyser} countIn={countIn} recording={recording} />
          <div className="status">{status || (connected ? "Say a vibe, clap, hum, or ask for changes." : " ")}</div>
          {session && (
            <button className="transport" onClick={togglePlay} disabled={recording} title="Spacebar">
              {transport === "started" ? "❚❚  Pause" : "▶  Play"}
            </button>
          )}
          <div className="beat">
            {v &&
              SLOTS.map((slot) => {
                const user = [...(session?.parts ?? [])].reverse().find((p) => p.kind === "drum" && p.slot === slot);
                return (
                  <div key={slot} id={`pulse-${user ? user.id : `kit-${slot}`}`} className={`slot ${user ? "yours" : ""} ${user?.muted ? "muted" : ""}`}>
                    <b>{slot}</b>
                    <span>{user ? `your ${user.name}` : v.pattern[slot].length ? "kit" : "—"}</span>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="side">
          <div className="card">
            <h3>Vibe</h3>
            <div className="chips">
              {PRESETS.map((p) => (
                <button key={p} onClick={manual(() => setVibe(p))}>
                  {p}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (vibeInput.trim()) void safe(() => setVibe(vibeInput));
              }}
            >
              <input value={vibeInput} onChange={(e) => setVibeInput(e.target.value)} placeholder="or type one: rainy night lo-fi" />
            </form>
          </div>

          <div className="card">
            <h3>Parts</h3>
            {!session?.parts.length && <p className="muted">Clap, hum or make any sound to add a part.</p>}
            {session?.parts.map((p) => (
              <div key={p.id} id={`pulse-${p.id}`} className={`part ${p.kind} ${p.muted ? "muted" : ""}`}>
                <div>
                  <b>{p.name}</b>
                  <span>
                    {p.kind}
                    {p.kind === "drum" ? ` → ${p.slot}` : ""}
                    {p.notes ? ` · ${p.notes.length} notes` : ""}
                  </span>
                </div>
                <div className="part-actions">
                  {p.kind === "drum" && (
                    <select value={p.slot} onChange={(e) => void safe(() => patchPart(p.name, { slot: e.target.value }, "Moved"))}>
                      {SLOTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  )}
                  <button onClick={manual(() => patchPart(p.name, { muted: !p.muted }, p.muted ? "Unmuted" : "Muted"))}>
                    {p.muted ? "unmute" : "mute"}
                  </button>
                  <button onClick={manual(() => removePart(p.name))}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Manual controls</h3>
            <div className="chips">
              <button onClick={manual(() => recordPart("drum"))}>● clap / hit</button>
              <button onClick={manual(() => recordPart("melody"))}>● hum melody</button>
              <button onClick={manual(() => recordPart("bass"))}>● hum bass</button>
              <button onClick={manual(() => recordPart("texture"))}>● texture</button>
              <button onClick={() => void addBacking()}>+ backing track</button>
              <button onClick={togglePlay}>{transport === "started" ? "pause" : "play"}</button>
              <button className="primary" onClick={manual(exportSong)}>
                export
              </button>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={quietWhileTalking} onChange={(e) => setQuietWhileTalking(e.target.checked)} />
              Fade the music out while the producer talks
            </label>
            {exported && (
              <a className="download" href={exported.url} download={`loopstack-${v?.genre ?? "track"}.wav`}>
                ⬇ Download your {Math.round(exported.seconds)}-second track
              </a>
            )}
          </div>

          <div className="card transcript">
            <h3>Session</h3>
            {lines.map((l, i) => (
              <p key={i} className={l.who}>
                <b>{l.who}</b> {l.text}
              </p>
            ))}
          </div>
        </section>
      </main>
      <DebugPanel
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        env={`mic permission: ${micPermission} · secure context: ${window.isSecureContext} · audio: ${Tone.getContext().state} ${Tone.getContext().sampleRate} Hz · backend: ${health ? `${health.mode}, sandbox ${health.sandbox}` : "offline"} · producer: ${conversation.status}`}
      />
    </div>
  );
}
