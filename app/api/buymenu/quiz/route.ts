import { NextResponse } from "next/server";

// Builds a BUY MENU paper server-side. Same arrangement as the BUILD PATH
// route: answers travel with the questions for solo play, while the lobby race
// keeps them on the server.
const { makeQuiz, reference } = require("@/scripts/buymenuCore");

export const revalidate = 0;

const TIERS = [1, 2, 3, 4];

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const tier = TIERS.includes(Number(p.get("tier"))) ? Number(p.get("tier")) : 1;
  const count = Math.min(20, Math.max(5, Number(p.get("count")) || 10));
  const seed = (p.get("seed") || "practice").slice(0, 80);

  return NextResponse.json({ tier, seed, patch: reference.updatedFor, questions: makeQuiz({ tier, count, seed }) });
}
