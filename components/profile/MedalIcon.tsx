"use client";

import { Trophy, Award, Medal as MedalGlyph, Sprout, Flame, Crosshair, Wind, Sparkles, Mic2 } from "lucide-react";
import { BadgeShape } from "@/components/profile/BadgeShape";

// Same crest as the rank levels, so a medal and a rank level read as one
// family of object on the profile instead of two visual languages (this used
// to be an AI-generated JPEG per medal — a photo next to a coded rank badge
// never looked like it belonged to the same site).

const GLYPH: Record<string, typeof Trophy> = {
  "season-first": Trophy,
  "season-second": Award,
  "season-third": MedalGlyph,
  "pre-season-1": Sprout,
  "medal-clutch": Flame,
  "medal-entry": Crosshair,
  "medal-utility": Wind,
  "medal-chaos": Sparkles,
  "medal-voice": Mic2,
};

/** The medal's tint, lightened and darkened, for the crest's gradient. */
function shades(hex: string): [string, string] {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const lighten = (v: number) => clamp(v + (255 - v) * 0.35);
  const darken = (v: number) => clamp(v * 0.65);
  const toHex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  return [toHex(lighten(r), lighten(g), lighten(b)), toHex(darken(r), darken(g), darken(b))];
}

export default function MedalIcon({ slug, colour, size = 28 }: { slug: string; colour: string; size?: number }) {
  const Glyph = GLYPH[slug] ?? MedalGlyph;
  return (
    <BadgeShape size={size} colors={shades(colour)}>
      <Glyph size={Math.round(size * 0.42)} color="#fff" strokeWidth={2.4} />
    </BadgeShape>
  );
}
