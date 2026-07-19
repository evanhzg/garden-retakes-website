import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";
import { ITEMS, parseInv, buildBagList } from "@/scripts/pkmnItems";

export const dynamic = "force-dynamic";

// scripts/pkmnItems.js is plain JS; TS infers ITEMS as a narrow object
// literal with no string index signature. Widen it here for the dynamic
// item-id lookups below.
const ITEM_CATALOG: Record<string, unknown> = ITEMS;

// GET /api/pkmn/v1/inventory
//
// The trainer's bag.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(auth.steamId) } });
  if (!trainer) {
    return NextResponse.json({ error: "No trainer save yet." }, { status: 404 });
  }

  return NextResponse.json({ bag: buildBagList(parseInv(trainer.Inventory)) });
}

// PATCH /api/pkmn/v1/inventory
// Body: { deltas: { [itemId]: number } }
//
// Adjusts item counts by a signed delta. The live socket battle/overworld
// flows already cover balls/potions during play; this is the REST path for
// everything else — e.g. a future shop purchase. Item ids are validated
// against the known catalog (scripts/pkmnItems.js); counts never go negative.
export async function PATCH(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  let body: { deltas?: Record<string, number> } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const deltas = body.deltas || {};

  for (const [id, delta] of Object.entries(deltas)) {
    if (!ITEM_CATALOG[id]) {
      return NextResponse.json({ error: `Unknown item: ${id}` }, { status: 400 });
    }
    if (typeof delta !== "number" || !Number.isFinite(delta)) {
      return NextResponse.json({ error: `Invalid delta for ${id}` }, { status: 400 });
    }
  }

  const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(auth.steamId) } });
  if (!trainer) {
    return NextResponse.json({ error: "No trainer save yet." }, { status: 404 });
  }

  const inv = parseInv(trainer.Inventory);
  for (const [id, delta] of Object.entries(deltas)) {
    inv[id] = Math.max(0, (inv[id] || 0) + delta);
    if (inv[id] === 0) delete inv[id];
  }

  await prisma.pkmnTrainer.update({
    where: { SteamId: BigInt(auth.steamId) },
    data: { Inventory: JSON.stringify(inv) },
  });

  return NextResponse.json({ bag: buildBagList(inv) });
}
