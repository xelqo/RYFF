import { useState } from "react";
import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import { api } from "./api";
import { useLoopstack } from "./useLoopstack";
import { usePlayer } from "./usePlayer";
import { useRecorder } from "./useRecorder";
import { Visualiser } from "./Visualiser";
import { Producing } from "./Producing";
import { PROMPTS, describe } from "./describe";
import type { PartKind, Session, Version } from "./types";

const PRESETS = ["chill lo-fi", "dark trap", "summer house", "upbeat pop"];
const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined;

function readyMessage(version: Version, session: Session) {
  const part = session.parts[session.parts.length - 1];
  const what = version.n === 1 || !part ? `a ${session.vibe.text} beat` : `${part.kind} added (${part.words.join(", ")})`;
  return `v${version.n} is ready and playing now: ${what}.`;
}

export default function App() {
  const [vibeInput, setVibeInput] = useState("");
  const player = usePlayer();
  const recorder = useRecorder();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<PartKind>("drums");
  const [heard, setHeard] = useState<string[] | null>(null);
  const agentMuted = player.playing || recorder.recording;
  const conversation = useConversation({ micMuted: agentMuted });
  const agentOn = conversation.status === "connected";

  const loop = useLoopstack(async (version, session) => {
    try {
      await player.play(api.fileUrl(version.url), version.n);
    } catch (e) {
      setError(`Tap play to hear v${version.n} (${String(e)})`);
    }
    if (agentOn) conversation.sendContextualUpdate(readyMessage(version, session));
  });
  const { session, building, error, setError } = loop;

  const chooseVibe = async (text: string) => {
    const vibe = text.trim();
    if (!vibe) return "no vibe given";
    try {
      await loop.setVibe(vibe);
      return `generating a version for ${vibe}`;
    } catch (e) {
      setError(String(e));
      return `could not start ${vibe}, ask them to try again`;
    }
  };

  useConversationClientTool("set_vibe", async (params) => chooseVibe(String(params.vibe_text ?? "")));

  const prompt = PROMPTS[Math.min(step, PROMPTS.length - 1)];

  const advance = (done: PartKind) => {
    const next = PROMPTS.findIndex((p) => p.kind === done) + 1;
    const index = Math.max(step, Math.min(next, PROMPTS.length - 1));
    setStep(index);
    setKind(PROMPTS[index].kind);
  };

  const addSound = async (partKind: PartKind) => {
    const current = loop.sessionRef.current;
    if (!current) return "no song yet, ask for a vibe first";
    if (building) return "still producing the last version, wait for the update";
    if (recorder.recording) return "already recording";
    setError(null);
    setHeard(null);
    try {
      player.pause();
      const take = await recorder.record();
      const latest = current.versions.length;
      const from = player.current !== null && player.current !== latest ? player.current : undefined;
      const result = await api.addPart(current.id, take, partKind, from);
      if ("error" in result) return "too quiet, ask again";
      const words = describe(result.part.traits);
      setHeard(words);
      loop.watch(`Adding ${partKind}`, words.join(" · "));
      advance(partKind);
      return `heard: ${words.join(", ")}`;
    } catch (e) {
      setError(String(e));
      return "recording failed, ask them to try again";
    }
  };

  const skipPart = (partKind: PartKind) => {
    advance(partKind);
    return `skipped ${partKind}`;
  };

  const playVersion = async (n?: number) => {
    const versions = loop.sessionRef.current?.versions ?? [];
    const version = n ? versions.find((v) => v.n === n) : versions[versions.length - 1];
    if (!version) return versions.length ? `no v${n}, there are ${versions.length} versions` : "no versions yet";
    try {
      await player.play(api.fileUrl(version.url), version.n);
      return `playing v${version.n}`;
    } catch (e) {
      setError(String(e));
      return `could not play v${version.n}`;
    }
  };

  const downloadSong = async () => {
    const versions = loop.sessionRef.current?.versions ?? [];
    const version = versions.find((v) => v.n === player.current) ?? versions[versions.length - 1];
    if (!version) return "nothing to download yet";
    try {
      const response = await fetch(api.fileUrl(version.url));
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const blob = await response.blob();
      const ext = version.url.split("?")[0].split(".").pop() || "mp3";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `loopstack-v${version.n}.${ext}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      return `downloaded v${version.n}`;
    } catch (e) {
      setError(String(e));
      return "download failed";
    }
  };

  useConversationClientTool("download_song", async () => downloadSong());
  useConversationClientTool("play_version", async (params) => playVersion(params.n ? Number(params.n) : undefined));
  useConversationClientTool("record_sound", async (params) => addSound((params.kind as PartKind) ?? prompt.kind));
  useConversationClientTool("skip_part", async (params) => skipPart((params.kind as PartKind) ?? prompt.kind));

  const startAgent = async () => {
    setError(null);
    const token = await api.agentToken();
    if (token) conversation.startSession({ conversationToken: token });
    else if (AGENT_ID) conversation.startSession({ agentId: AGENT_ID });
    else setError("No agent configured. Set VITE_ELEVENLABS_AGENT_ID in frontend/.env.local.");
  };

  return (
    <main className="app">
      <header className="top">
        <h1>Loopstack</h1>
        <div className="producer">
          <span className={`dot ${conversation.status}`} />
          {agentOn ? (
            <>
              <span>{agentMuted ? "Producer muted" : conversation.isSpeaking ? "Producer is talking" : "Producer is listening"}</span>
              {agentMuted && <button onClick={player.pause}>Talk to producer</button>}
              <button className="ghost" onClick={() => conversation.endSession()}>End</button>
            </>
          ) : (
            <button onClick={startAgent} disabled={conversation.status === "connecting"}>
              {conversation.status === "connecting" ? "Connecting…" : "Start producer"}
            </button>
          )}
        </div>
      </header>

      <section className="card">
        <h2>{session ? `Vibe: ${session.vibe.text}` : "What vibe are we making?"}</h2>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p} className={session?.vibe.text === p ? "chip on" : "chip"} onClick={() => chooseVibe(p)}>
              {p}
            </button>
          ))}
        </div>
        <form
          className="vibe-form"
          onSubmit={(e) => {
            e.preventDefault();
            chooseVibe(vibeInput);
            setVibeInput("");
          }}
        >
          <input value={vibeInput} onChange={(e) => setVibeInput(e.target.value)} placeholder="or type any vibe" />
          <button type="submit">Set vibe</button>
        </form>
      </section>

      {building && <Producing building={building} />}

      {session && session.versions.length > 0 && (
        <section className="card player">
          <div className="player-row">
            <button className="play" onClick={() => (player.playing ? player.pause() : player.resume())} disabled={player.current === null}>
              {player.playing ? "Pause" : "Play"}
            </button>
            <div>
              <div className="now">{player.current ? `v${player.current}` : "Ready"}</div>
              <div className="muted">{session.vibe.text} · {session.vibe.bpm} BPM</div>
            </div>
            <button className="ghost download" onClick={downloadSong} disabled={player.current === null}>Download</button>
          </div>
          <Visualiser analyser={player.analyser} active={player.playing} />
          <div className="versions">
            {session.versions.map((v) => (
              <button key={v.n} className={player.current === v.n ? "chip on" : "chip"} onClick={() => playVersion(v.n)}>
                v{v.n}
              </button>
            ))}
          </div>
        </section>
      )}

      {session && (
        <section className="card">
          <h2>{recorder.recording ? (recorder.secondsLeft ? `Recording… ${recorder.secondsLeft}` : "Get ready…") : prompt.ask}</h2>
          <div className="presets">
            {PROMPTS.map((p) => (
              <button key={p.kind} className={kind === p.kind ? "chip on" : "chip"} onClick={() => setKind(p.kind)} disabled={recorder.recording}>
                {p.kind}
              </button>
            ))}
          </div>
          <div className="actions">
            {recorder.recording ? (
              <button className="record on" onClick={recorder.stop}>Stop</button>
            ) : (
              <button className="record" onClick={() => addSound(kind)} disabled={Boolean(building)}>Record {kind}</button>
            )}
            <button className="ghost" onClick={() => skipPart(kind)} disabled={recorder.recording}>Skip {kind}</button>
          </div>
          {heard && !building && !recorder.recording && <p className="muted">Last take: {heard.join(" · ")}</p>}
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  );
}
