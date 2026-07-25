import { NextResponse } from "next/server";

// The HEADSHOT pool, served once and cached. The browser needs the whole list
// anyway (autocomplete, and scoring each guess without a round-trip), so the
// daily answer is derived client-side from the UTC date using the same
// `pickDaily` the server uses — every player worldwide lands on the same pro.
//
// `daily` / `endless` are id lists in fame order: the client intersects them
// with `players` to rebuild the answer pools without shipping them twice.
const { buildPool, answerPool, todayKey } = require("@/scripts/headshotCore");

export const revalidate = 3600;

export async function GET() {
  const pool = buildPool();

  return NextResponse.json(
    {
      date: todayKey(),
      generatedAt: pool.generatedAt,
      source: pool.source,
      players: pool.all,
      daily: answerPool("daily").map((p: { id: string }) => p.id),
      endless: answerPool("endless").map((p: { id: string }) => p.id),
    },
    {
      headers: {
        // Safe to cache hard: the dataset only changes when the seed script is
        // re-run and redeployed, and the answer is a pure function of the date.
        "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
      },
    }
  );
}
