import { NextResponse } from "next/server";
import { applyOp, parseOp, stateOf } from "@/lib/re5ws";
import { GAME_IDS, catalogPick, pluginRequest, readStore, writeStore } from "@/lib/re5wsServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/re5ws/edit  { apiKey, userId, op, ...fields }
// One change made in the in-game RE5WS Manager. ops (lib/re5ws.ts parseOp):
//   equip {loadoutId, side, slot, itemId|null}   equipNew {loadoutId, side, slot, catalogId}
//   create {name?}  copy  delete  activate  rename {name}  color   (each with loadoutId)
// Answers with the new state, and affectsGame when the loadout in use changed —
// the plugin then re-fetches the player's skins (css_invsim_refresh), which is
// what makes the change show in game at once.
export async function POST(request: Request) {
  const req = await pluginRequest(request);
  if ("response" in req) return req.response;
  const op = parseOp(req.body);
  if (typeof op === "string") return NextResponse.json({ ok: false, error: op }, { status: 400 });
  try {
    const store = await readStore(req.steamId);
    const result = applyOp(store, op, catalogPick);
    if (result.ok) await writeStore(req.steamId, store);
    return NextResponse.json({ ...result, state: stateOf(store, GAME_IDS) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "save failed" }, { status: 500 });
  }
}
