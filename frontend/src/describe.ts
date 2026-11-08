import type { PartKind, Traits } from "./types";

export const PROMPTS: { kind: PartKind; ask: string }[] = [
  { kind: "drums", ask: "Want drums? Drop a penny, clap or tap something." },
  { kind: "bass", ask: "Hum something low for the bass." },
  { kind: "melody", ask: "Hum a tune for the melody." },
  { kind: "texture", ask: "Any other sound? Keys, a crinkle, anything." },
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
