import { NextResponse } from "next/server";
import { serverSnapshot } from "@/lib/liveSnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// What the server is doing right now, for the homepage card.
//
// Public — it is the same thing anyone learns by connecting — and it never
// returns RCON output verbatim, only the parsed fields.
//
// Reads through the shared snapshot rather than running its own RCON command.
// This route fires on every homepage view, so one command per visitor was one
// command too many; the cache collapses a burst into a single conversation
// with the game server.

export async function GET() {
  const s = await serverSnapshot();
  return NextResponse.json({
    online: s.online,
    map: s.map,
    mode: s.mode,
    players: s.players,
    ranked: s.ranked,
    competitive: s.competitive,
  });
}
