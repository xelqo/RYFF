export type Slot = "kick" | "snare" | "hat" | "perc";
export const SLOTS: Slot[] = ["kick", "snare", "hat", "perc"];

export type PartKind = "drum" | "melody" | "bass" | "texture" | "backing";

export interface Note {
  start_step: number;
  dur_steps: number;
  midi: number;
  velocity: number;
}

export interface Vibe {
  text: string;
  genre: string;
  label: string;
  bpm: number;
  key: string;
  tonic: number;
  scale: string;
  swing: number;
  bars: number;
  pattern: Record<Slot, number[]>;
  chords: number[][];
  bass_roots: number[];
  kit: Record<Slot, string | null>;
  instruments: { lead: string | null; bass: string | null };
}

export interface Part {
  id: string;
  name: string;
  kind: PartKind;
  muted: boolean;
  volume: number;
  slot?: Slot;
  sample_url?: string;
  notes?: Note[];
  loop_steps?: number;
  loop_url?: string;
  raw_url?: string;
  prompt?: string;
}

export interface Session {
  id: string;
  vibe: Vibe;
  parts: Part[];
  warnings?: string[];
}

export interface Health {
  ok: boolean;
  sandbox: string;
  sandbox_error?: string | null;
  fallback: boolean;
  mode: string;
  elevenlabs: boolean;
}
