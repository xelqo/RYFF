import type { PartKind, Traits } from "./types";

// Two kinds of sound: drums, and a backing track (sent as "melody"; any sound works, not only hums).
export const PROMPTS: { kind: PartKind; label: string; ask: string }[] = [
  { kind: "drums", label: "Drums", ask: "Drums: clap, tap, drop a penny, or upload a drum sound." },
  { kind: "melody", label: "Backing track", ask: "Backing track: hum, whistle, play something, or upload any sound." },
];

const level = (v: number, low: string, high: string) => (v >= 0.6 ? high : v <= 0.35 ? low : null);

export function describe(traits: Traits) {
  const words = [
    level(traits.busyness, "sparse", "busy"),
    level(traits.punch, "soft", "punchy"),
    level(traits.brightness, "warm", "bright"),
    traits.pitch_register,
    traits.contour && traits.contour !== "flat" ? traits.contour : null,
    traits.smoothness === undefined ? null : level(traits.smoothness, "choppy", "smooth"),
  ].filter((w): w is string => Boolean(w));
  return words.length ? words : ["steady"];
}
