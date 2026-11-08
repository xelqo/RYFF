export type PartKind = "drums" | "bass" | "melody" | "texture";

export interface Traits {
  busyness: number;
  punch: number;
  brightness: number;
  pitch_register?: "low" | "mid" | "high";
  contour?: "rising" | "falling" | "arch" | "flat";
  smoothness?: number;
  length_s: number;
}

export interface Part {
  id: string;
  kind: PartKind;
  raw_url: string;
  hit_url?: string;
  traits: Traits;
  words: string[];
}

export interface Version {
  n: number;
  song_id: string;
  url: string;
  plan: unknown;
  created_at: string;
}

export interface Vibe {
  text: string;
  styles: string[];
  bpm: number;
}

export interface Session {
  id: string;
  vibe: Vibe;
  parts: Part[];
  versions: Version[];
  seed: number;
  status?: "building" | "ready" | "error";
  error?: string | null;
}

export type AddPartResult = { part: Part; status: "building" } | { error: string };

export interface Api {
  createSession(vibeText: string): Promise<Session>;
  changeVibe(sessionId: string, vibeText: string): Promise<{ status: "building" }>;
  addPart(sessionId: string, audio: Blob, kind: PartKind, fromVersion?: number): Promise<AddPartResult>;
  getSession(sessionId: string): Promise<Session>;
  agentToken(): Promise<string | null>;
  transcribe(audio: Blob): Promise<string>;
  fileUrl(path: string): string;
}
