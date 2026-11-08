import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import * as api from "./api";
import { engine } from "./engine";
import { mic } from "./recorder";
import { encodeWav } from "./wav";
import Visualizer from "./Visualizer";
import DebugPanel from "./DebugPanel";
import { type RecState } from "./RecordOverlay";
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
  const [connecting, setConnecting] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);
  const [rec, setRec] = useState<RecState>({ phase: "idle" });
  const [lines, setLines] = useState<Line[]>([]);
  const [exported, setExported] = useState<{ url: string; seconds: number } | null>(null);
  const [health, setHealth] = useState<Health | null | undefined>(undefined); // undefined = not checked yet
  const [error, setError] = useState<string | null>(null);
  const [vibeInput, setVibeInput] = useState("");
  const [transport, setTransport] = useState<"started" | "paused" | "stopped">("stopped");
  const [quietWhileTalking, setQuietWhileTalking] = useState(true);
  const [beatWhileHumming, setBeatWhileHumming] = useState(false); // full beat during hums: headphones only
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

  /** Wait until the producer has been silent for a moment (it often adds a word after the tool call). */
  async function waitForAgentToFinish() {
    if (convRef.current.status !== "connected") return;
    const until = Date.now() + 4000;
    let quietSince = convRef.current.isSpeaking ? 0 : Date.now();
    while (Date.now() < until) {
      if (convRef.current.isSpeaking) quietSince = 0;
      else if (!quietSince) quietSince = Date.now();
      if (quietSince && Date.now() - quietSince >= 700) return;
      await sleep(50);
    }
    debug.warn("record", "The producer was still talking after 4 s; recording anyway (its voice is muted)");
  }

  /** Silence the producer's speaker output so its voice can never end up in a take. */
  function setAgentVolume(volume: number) {
    try {
      if (convRef.current.status === "connected") convRef.current.setVolume({ volume });
    } catch {
      /* not connected */
    }
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
    if (busy.current) {
      debug.warn("record", `Ignored record_part(${kindRaw}): the previous take is still being processed`);
      return "Still working on the previous take. Wait for its result before recording again.";
    }
    busy.current = true;
    const { kind, slot } = normalizeKind(kindRaw);
    try {
      await Tone.start();
      if (!sessionRef.current) await setVibe("chill lo-fi");
      const s = sessionRef.current!;
      setRec({ phase: "waiting" });
      await waitForAgentToFinish();
      setAgentMic(true); // otherwise the agent hears your clap as an interruption
      setAgentVolume(0); // and its voice can't leak into the take
      setRecording(true);
      let take: { samples: Float32Array; sampleRate: number };
      let preRoll = 0;
      let steps = HUM_STEPS;
      if (kind === "drum") {
        engine.stop(); // record the hit clean, without the beat bleeding in
        setStatus("3, 2, 1… then clap");
        // 3 beeps (the last one higher) from the app, then recording starts once they've died away
        const t0 = Tone.now() + 0.15;
        const gap = 0.5;
        for (let i = 0; i < 3; i++) {
          engine.beep(t0 + i * gap, i === 2 ? "A5" : "E5");
          Tone.getDraw().schedule(() => setRec({ phase: "countin", n: 3 - i, kind }), t0 + i * gap);
        }
        const start = t0 + 2 * gap + 0.25;
        Tone.getDraw().schedule(() => {
          setRec({ phase: "recording", kind, endsAt: performance.now() + HIT_SECONDS * 1000, total: HIT_SECONDS * 1000 });
          setStatus(`Recording for ${HIT_SECONDS} seconds: clap or tap a few times`);
        }, start);
        take = await mic.capture(start, start + HIT_SECONDS);
      } else {
        preRoll = PRE_ROLL;
        steps = HUM_STEPS;
        engine.duck(false); // the beat must be audible while you hum along
        setStatus(beatWhileHumming ? "Count-in… then go on the 1" : "Count-in… then go on the 1 (clicks only, the beat comes back after)");
        const recSeconds = steps * (60 / s.vibe.bpm / 4);
        const downbeat = engine.playWithCountIn(
          s,
          (n) =>
            n > 0
              ? setRec({ phase: "countin", n, kind })
              : setRec({ phase: "recording", kind, endsAt: performance.now() + recSeconds * 1000, total: recSeconds * 1000 }),
          beatWhileHumming,
          steps / 4,
        );
        take = await mic.capture(downbeat - preRoll, downbeat + recSeconds + 0.2);
      }
      engine.doneChime(); // audible "recording stopped"
      setRec({ phase: "analysing" });
      setRecording(false);
      setAgentMic(false);
      setAgentVolume(1);
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
      setRec({ phase: "idle" });
      setRecording(false);
      setAgentMic(false);
      setAgentVolume(1);
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
      setError(out);
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
    // never duck during a take: you need to hear the beat while humming
    engine.duck(quietWhileTalking && connected && conversation.isSpeaking && !recording);
  }, [quietWhileTalking, connected, conversation.isSpeaking, recording]);

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
        // Errors stay in the keyboard-accessible debug panel.
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
    if (health === undefined) return; // first check hasn't finished yet
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
    if (connecting) return;
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
      setConnecting(true);
      await Tone.start();
      await mic.init();
      await conversation.startSession({ agentId: AGENT_ID });
    } catch (e) {
      setError(`Couldn't start the producer: ${errMsg(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  const countIn = rec.phase === "countin" ? rec.n : rec.phase === "recording" ? 0 : null;
  const orbState = countIn !== null && countIn > 0 ? `Count in · ${countIn}`
    : rec.phase === "waiting" ? "Get ready" : rec.phase === "recording" ? "Recording" : status ? "Processing" : connecting ? "Connecting"
    : connected ? conversation.isSpeaking ? "Speaking" : "Listening" : "Click to talk";

  return (
    <div className={`app ${session ? "has-session" : ""}`}>
      <main>
        <section className="stage" aria-label="Loopstack voice studio">
          <Visualizer getAgent={getAgent} getMic={() => mic.getLevel()} analyser={engine.analyser} countIn={countIn} recording={recording} listening={connected} expanded={!!session} />
          <div className="orb-anchor">
            <button className={`voice-orb ${connected ? "connected" : ""} ${recording ? "recording" : ""} ${status || connecting ? "processing" : ""}`}
              onClick={toggleTalk} disabled={connecting || recording}
              aria-label={connected ? "Disconnect producer" : "Connect producer"}
              aria-pressed={connected} title={connected ? "Click to end conversation" : "Click to talk to Loopstack"}>
              <span className="orb-core" /><span className="orb-glint" />
            </button>
            <div className="orb-status" role="status">{orbState}</div>
            {error && <button className="orb-error" onClick={() => setError(null)}>{error}</button>}
            {exported && <a className="orb-download" href={exported.url} download={`loopstack-${session?.vibe.genre ?? "track"}.wav`}>Download track ↓</a>}
          </div>
        </section>
      </main>
      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)}
        env={`mic permission: ${micPermission} · secure context: ${window.isSecureContext} · audio: ${Tone.getContext().state} ${Tone.getContext().sampleRate} Hz · backend: ${health ? `${health.mode}, sandbox ${health.sandbox}` : "offline"} · producer: ${conversation.status}`} />
    </div>
  );
}
