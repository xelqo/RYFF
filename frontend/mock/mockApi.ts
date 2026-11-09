import type { AddPartResult, Api, Part, PartKind, Session, Traits } from "../src/types";
import sample from "./session.json";

const BUILD_MS = 6000;
const PRESET_STYLES: Record<string, { styles: string[]; bpm: number }> = {
  "chill lo-fi": { styles: ["chill lo-fi hip hop", "dusty rhodes", "vinyl crackle"], bpm: 80 },
  "dark trap": { styles: ["dark trap", "808 bass", "eerie bells"], bpm: 140 },
  "summer house": { styles: ["summer house", "bright plucks", "four on the floor"], bpm: 124 },
  "upbeat pop": { styles: ["upbeat pop", "glossy synths", "handclaps"], bpm: 110 },
};
const WORDS: Record<PartKind, string[]> = {
  drums: ["driving, busy drums", "punchy claps"],
  bass: ["deep, smooth sub bass"],
  melody: ["soaring, rising lead melody"],
  texture: ["shimmering ambient texture"],
};

let session: Session | null = null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function vibeFor(text: string) {
  const preset = PRESET_STYLES[text.toLowerCase().trim()];
  return { text, styles: preset?.styles ?? [text], bpm: preset?.bpm ?? sample.vibe.bpm };
}

function scheduleVersion() {
  if (!session) return;
  session.status = "building";
  const target = session;
  setTimeout(() => {
    const n = target.versions.length + 1;
    target.versions.push({
      n,
      song_id: `mock-${n}`,
      url: `/mock-audio/v${Math.min(target.parts.length + 1, 4)}.wav`,
      plan: {},
      created_at: new Date().toISOString(),
    });
    target.status = "ready";
  }, BUILD_MS);
}

function fakeTraits(kind: PartKind, seconds: number): Traits {
  const r = () => Math.round(Math.random() * 100) / 100;
  const traits: Traits = { busyness: r(), punch: r(), brightness: r(), length_s: seconds };
  if (kind === "bass" || kind === "melody") {
    traits.pitch_register = kind === "bass" ? "low" : "high";
    traits.contour = (["rising", "falling", "arch", "flat"] as const)[Math.floor(Math.random() * 4)];
    traits.smoothness = r();
  }
  return traits;
}

export const mockApi: Api = {
  async createSession(vibeText) {
    await wait(300);
    const created: Session = { id: `mock-${Date.now()}`, vibe: vibeFor(vibeText), parts: [], versions: [], seed: sample.seed };
    session = created;
    scheduleVersion();
    return clone(created);
  },

  async changeVibe(sessionId, vibeText) {
    await wait(300);
    if (!session || session.id !== sessionId) throw new Error("no session");
    session.vibe = vibeFor(vibeText);
    scheduleVersion();
    return { status: "building" };
  },

  async addPart(sessionId, audio, kind): Promise<AddPartResult> {
    await wait(800);
    if (!session || session.id !== sessionId) throw new Error("no session");
    if (audio.size < 2000) return { error: "too quiet" };
    const part: Part = {
      id: `part-${session.parts.length + 1}`,
      kind,
      raw_url: URL.createObjectURL(audio),
      traits: fakeTraits(kind, 4),
      words: WORDS[kind],
    };
    session.parts.push(part);
    scheduleVersion();
    return { part: clone(part), status: "building" };
  },

  async getSession(sessionId) {
    await wait(100);
    if (!session || session.id !== sessionId) throw new Error("no session");
    return clone(session);
  },

  async detectKey() {
    return { key: "A minor" };
  },

  async speak() {
    return "";
  },

  async transcribe() {
    return "chill lo-fi";
  },

  async agentToken() {
    return null;
  },

  fileUrl(path) {
    return path;
  },
};
