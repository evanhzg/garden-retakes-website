import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";
import { normaliseStore, type InventoryStore } from "@/lib/inventory";
import { buildSnapshot, generateKey } from "@/lib/share";

export const dynamic = "force-dynamic";

// Create a shareable key for one loadout. Anyone can share; admins can also
// publish a loadout as a Featured preset (body.featured + ?key= or admin session).
export async function POST(req: Request) {
  let body: { store?: InventoryStore; loadoutId?: string; featured?: boolean; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!body.store || !body.loadoutId) {
    return NextResponse.json({ error: "store and loadoutId required" }, { status: 400 });
  }

  const store = normaliseStore(body.store);
  const snapshot = buildSnapshot(store, body.loadoutId);
  if (!snapshot) {
    return NextResponse.json({ error: "loadout not found" }, { status: 404 });
  }

  const session = getSession();
  let featured = false;
  if (body.featured) {
    const ctx = await getAdminContext(body.key);
    featured = ctx.level >= AdminLevel.Admin;
    if (!featured) {
      return NextResponse.json({ error: "Only admins can feature a loadout." }, { status: 403 });
    }
  }

  const data = JSON.stringify(snapshot);

  // Generate a unique key (retry on the rare collision).
  let shareKey = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateKey(6);
    const exists = await prisma.sharedLoadout.findUnique({ where: { ShareKey: candidate } });
    if (!exists) {
      shareKey = candidate;
      break;
    }
  }
  if (!shareKey) {
    return NextResponse.json({ error: "could not allocate a key" }, { status: 500 });
  }

  await prisma.sharedLoadout.create({
    data: {
      ShareKey: shareKey,
      OwnerSteamId: session ? BigInt(session.steamId) : BigInt(0),
      OwnerName: session?.name ?? null,
      Name: snapshot.name.slice(0, 64),
      Data: data,
      Featured: featured,
      CreatedAt: new Date(),
    },
  });

  return NextResponse.json({ key: shareKey, featured });
}
