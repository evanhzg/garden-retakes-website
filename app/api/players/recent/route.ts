import { NextResponse } from "next/server";
import { recentFormFor } from "@/lib/recentForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/players/recent?ids=7656...,7656...&sessions=10
//
// Recent form for a whole lobby roster in one request. The alternative — one
// call per player — is six round trips fired the instant a match is found,
// which is exactly when the page has other things to do.
//
// Public: everything here is already on the public stats pages, and a lobby has
// to be able to show the other team's form to be worth anything.

/** Bots carry synthetic ids, and a roster of six is the largest real ask. */
const MAX_IDS = 12;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const ids = (params.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    // Steam IDs only: the lobby also holds bots, whose ids are `bot_xxxx`, and
    // asking the database about those would be a guaranteed miss per bot.
    .filter((s) => /^\d{5,20}$/.test(s))
    .slice(0, MAX_IDS);

  if (ids.length === 0) return NextResponse.json({ players: {} });

  const sessions = Math.min(25, Math.max(1, Number(params.get("sessions") ?? 10) || 10));

  try {
    const players = await recentFormFor(
      ids.map((s) => BigInt(s)),
      sessions
    );
    return NextResponse.json({ players, sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read recent form.", players: {} },
      { status: 500 }
    );
  }
}
