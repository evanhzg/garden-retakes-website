import { NextResponse } from "next/server";

// The PENTAKILL champion pool, served once and cached. Same arrangement as
// /api/headshot/players: the browser needs the whole list for autocomplete and
// for scoring a guess locally, and the daily answer is derived client-side from
// the UTC date with the same `pickDaily` the server uses.
const { buildPool, todayKey } = require("@/scripts/pentakillCore");

export const revalidate = 3600;

export async function GET() {
  const pool = buildPool();

  return NextResponse.json(
    {
      date: todayKey(),
      patch: pool.patch,
      generatedAt: pool.generatedAt,
      champions: pool.all,
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
