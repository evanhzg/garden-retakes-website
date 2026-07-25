import { NextResponse } from "next/server";

// Builds a BUILD PATH paper server-side so the 270 KB item/champion datasets
// never reach a client bundle. Answers are included: like the daily guessers,
// this is a casual solo game and local checking is what makes it feel instant.
// The lobby race takes a different path — the server keeps the answers there.
const { makeQuiz, patch } = require("@/scripts/buildpathCore");

export const revalidate = 0;

const TIERS = [1, 2, 3, 4];

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const tier = TIERS.includes(Number(p.get("tier"))) ? Number(p.get("tier")) : 1;
  const count = Math.min(20, Math.max(5, Number(p.get("count")) || 10));
  const seed = (p.get("seed") || "practice").slice(0, 80);
  const lang = p.get("lang") === "fr" ? "fr" : "en";

  return NextResponse.json({ tier, seed, patch: patch(), questions: makeQuiz({ tier, count, seed, lang }) });
}
