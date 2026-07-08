import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { defaultStore, normaliseStore, type InventoryStore } from "@/lib/inventory";

export const dynamic = "force-dynamic";

// GET: the signed-in player's saved inventory (empty default if none).
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const row = await prisma.webInventory.findUnique({
    where: { SteamId: BigInt(session.steamId) },
  });

  if (!row) return NextResponse.json(defaultStore());

  try {
    return NextResponse.json(normaliseStore(JSON.parse(row.Data) as InventoryStore));
  } catch {
    return NextResponse.json(defaultStore());
  }
}

// POST: upsert the signed-in player's inventory.
export async function POST(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  let store: InventoryStore;
  try {
    store = normaliseStore((await request.json()) as InventoryStore);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const data = JSON.stringify(store);
  const steamId = BigInt(session.steamId);
  await prisma.webInventory.upsert({
    where: { SteamId: steamId },
    create: { SteamId: steamId, Data: data },
    update: { Data: data },
  });

  return NextResponse.json({ ok: true });
}
