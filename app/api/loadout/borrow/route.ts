import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { defaultStore, normaliseStore, type InventoryStore } from "@/lib/inventory";
import { importSnapshot, type LoadoutSnapshot } from "@/lib/share";

export const dynamic = "force-dynamic";

// Called by the Garden-inventory plugin when a player runs /borrow <key>.
// Imports the shared loadout into the player's inventory and makes it active,
// so the next equipped fetch serves it. Guarded by the shared INVSIM_API_KEY.
export async function POST(request: Request) {
  const secret = (process.env.INVSIM_API_KEY ?? "").trim();
  if (!secret) {
    return NextResponse.json({ error: "INVSIM_API_KEY not configured" }, { status: 500 });
  }

  let body: { apiKey?: string; userId?: string; key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if ((body.apiKey ?? "").trim() !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body.userId || !/^\d{17}$/.test(body.userId)) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  const shareKey = (body.key ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(shareKey)) {
    return NextResponse.json({ ok: false, error: "bad key" }, { status: 400 });
  }

  const shared = await prisma.sharedLoadout.findUnique({ where: { ShareKey: shareKey } });
  if (!shared) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  let snapshot: LoadoutSnapshot;
  try {
    snapshot = JSON.parse(shared.Data) as LoadoutSnapshot;
  } catch {
    return NextResponse.json({ ok: false, error: "corrupt snapshot" }, { status: 500 });
  }

  const steamId = BigInt(body.userId);
  const row = await prisma.webInventory.findUnique({ where: { SteamId: steamId } });
  let store: InventoryStore;
  try {
    store = row ? normaliseStore(JSON.parse(row.Data) as InventoryStore) : defaultStore();
  } catch {
    store = defaultStore();
  }

  const next = importSnapshot(store, snapshot);
  const data = JSON.stringify(next);
  await prisma.webInventory.upsert({
    where: { SteamId: steamId },
    create: { SteamId: steamId, Data: data },
    update: { Data: data },
  });

  const active = next.loadouts.find((l) => l.id === next.activeLoadoutId);
  return NextResponse.json({ ok: true, loadout: active?.name ?? snapshot.name });
}
