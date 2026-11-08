import { useState } from "react";
import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import { api } from "./api";
import { useLoopstack } from "./useLoopstack";
import { usePlayer } from "./usePlayer";
import { Visualiser } from "./Visualiser";
import type { Session, Version } from "./types";

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
  const agentMuted = player.playing;
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

      {building && <section className="card">{building.label}…</section>}

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
          </div>
          <Visualiser analyser={player.analyser} active={player.playing} />
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  );
}
