import { NextResponse } from "next/server";
import { stateOf } from "@/lib/re5ws";
import { GAME_IDS, pluginRequest, readStore } from "@/lib/re5wsServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/re5ws/state  { apiKey, userId }
// The R5e-games plugin, when a player opens the in-game RE5WS Manager: every
// loadout and every item that can go in a slot, compact (see lib/re5ws.ts).
export async function POST(request: Request) {
  const req = await pluginRequest(request);
  if ("response" in req) return req.response;
  try {
    return NextResponse.json({ ok: true, state: stateOf(await readStore(req.steamId), GAME_IDS) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "read failed" }, { status: 500 });
  }
}
