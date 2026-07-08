import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findLoadout, normaliseStore, type InventoryStore } from "@/lib/inventory";

export const dynamic = "force-dynamic";

// Called by the Garden-inventory plugin when a player runs /loadout <name>.
// Guarded by the shared key (INVSIM_API_KEY here, invsim_apikey on the server).
// Sets the player's active loadout so the next inventory fetch serves it.
export async function POST(request: Request) {
  const secret = process.env.INVSIM_API_KEY ?? "";
  if (!secret) {
    return NextResponse.json({ error: "INVSIM_API_KEY not configured" }, { status: 500 });
  }

  let body: { apiKey?: string; userId?: string; loadoutName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (body.apiKey !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!body.userId || !/^\d{17}$/.test(body.userId) || !body.loadoutName?.trim()) {
    return NextResponse.json({ error: "userId and loadoutName required" }, { status: 400 });
  }

  const steamId = BigInt(body.userId);
  const row = await prisma.webInventory.findUnique({ where: { SteamId: steamId } });
  if (!row) {
    return NextResponse.json({ ok: false, error: "no inventory" }, { status: 404 });
  }

  let store: InventoryStore;
  try {
    store = normaliseStore(JSON.parse(row.Data) as InventoryStore);
  } catch {
    return NextResponse.json({ ok: false, error: "corrupt inventory" }, { status: 500 });
  }

  const needle = body.loadoutName.trim().toLowerCase();
  const loadout = store.loadouts.find((l) => l.name.trim().toLowerCase() === needle);
  if (!loadout) {
    return NextResponse.json({
      ok: false,
      error: "not found",
      available: store.loadouts.map((l) => l.name),
    });
  }

  const wasActive = findLoadout(store)?.id === loadout.id;
  if (!wasActive) {
    store.activeLoadoutId = loadout.id;
    await prisma.webInventory.update({
      where: { SteamId: steamId },
      data: { Data: JSON.stringify(store) },
    });
  }

  return NextResponse.json({ ok: true, loadout: loadout.name });
}
