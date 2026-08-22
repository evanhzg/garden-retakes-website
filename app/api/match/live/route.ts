import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// What is being played on the server right now.
//
// The game server upserts one row of JSON into WebLiveMatches every three
// seconds — map, mode, both team names and scores, and per player kills,
// deaths, assists, damage and rating. See LiveMatchBroadcaster in RE5-plugin.
// This reads that row; it does not talk to the server, and it invents nothing.
//
// Distinct from /api/server/live, which asks the server over RCON who is
// connected for the homepage card. That answers "is anyone on"; this answers
// "what is the score".
//
// `stale` rather than a filter: a row that stopped updating means the server
// went away mid-match, and a screen that says "last seen four minutes ago" is
// more use than one that goes blank.

/** Past this, the broadcaster has stopped and the scoreline is history. */
const STALE_MS = 30_000;

export async function GET() {
  try {
    const row = await prisma.webLiveMatch.findFirst({ orderBy: { UpdatedAtUtc: "desc" } });
    if (!row) return NextResponse.json({ live: null });

    let data: unknown = null;
    try {
      data = JSON.parse(row.Data);
    } catch {
      // A row we cannot parse is the same as no row, from here.
      return NextResponse.json({ live: null });
    }

    const age = Date.now() - row.UpdatedAtUtc.getTime();
    return NextResponse.json({
      live: data,
      updatedAt: row.UpdatedAtUtc,
      ageMs: age,
      stale: age > STALE_MS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the live match." },
      { status: 500 }
    );
  }
}
