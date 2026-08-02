import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";
import { normaliseStore, type InventoryStore } from "@/lib/inventory";
import { ALPHABET, buildSnapshot, snapshotLoadoutId, type LoadoutSnapshot } from "@/lib/share";

export const dynamic = "force-dynamic";

// Create — or refresh — the shareable key for one loadout.
//
// This used to mint a random key and INSERT a new row on every click, so a
// loadout accumulated a different code each time it was shared, and any code
// you had already given someone pointed at a stale snapshot. The key is now
// *derived* from the owner and the loadout id, which makes it a permanent
// handle: sharing the same loadout twice returns the same code and republishes
// the current contents.
//
// Deriving rather than adding a LoadoutId column is deliberate — the schema is
// shared with the game plugin, so this needs no migration to deploy.

/** Deterministic key for (owner, loadout). Same inputs, same code, forever. */
function derivedKey(owner: string, loadoutId: string, length: number): string {
  const digest = crypto.createHash("sha256").update(`garden-loadout:${owner}:${loadoutId}`).digest();
  let key = "";
  for (let i = 0; i < length; i += 1) key += ALPHABET[digest[i] % ALPHABET.length];
  return key;
}

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
  const name = snapshot.name.slice(0, 64);
  // Guests have no stable identity, but loadout ids are UUIDs, so the id alone
  // keeps their codes distinct from everyone else's.
  const owner = session?.steamId ?? "guest";
  const ownerId = session ? BigInt(session.steamId) : BigInt(0);

  // Walk 6 → 8 characters. A longer key is only reached when a shorter one is
  // already taken by a *different* loadout — a hash collision, not the normal
  // path — so codes stay six characters in practice.
  let shareKey = "";
  let reshared = false;
  for (let length = 6; length <= 8; length += 1) {
    const candidate = derivedKey(owner, body.loadoutId, length);
    const existing = await prisma.sharedLoadout.findUnique({ where: { ShareKey: candidate } });

    if (!existing) {
      shareKey = candidate;
      break;
    }

    // Ours? Then this is a re-share: refresh the snapshot behind the same code.
    let existingLoadoutId: string | undefined;
    try {
      existingLoadoutId = snapshotLoadoutId(JSON.parse(existing.Data) as LoadoutSnapshot);
    } catch {
      existingLoadoutId = undefined;
    }
    if (existingLoadoutId === body.loadoutId && existing.OwnerSteamId === ownerId) {
      shareKey = candidate;
      reshared = true;
      break;
    }
    // Otherwise it belongs to someone else — try a longer key.
  }

  if (!shareKey) {
    return NextResponse.json({ error: "could not allocate a key" }, { status: 500 });
  }

  const record = {
    OwnerSteamId: ownerId,
    OwnerName: session?.name ?? null,
    Name: name,
    Data: data,
  };

  await prisma.sharedLoadout.upsert({
    where: { ShareKey: shareKey },
    // A plain re-share must not silently un-feature a featured preset.
    update: featured ? { ...record, Featured: true } : record,
    create: { ShareKey: shareKey, CreatedAt: new Date(), Featured: featured, ...record },
  });

  return NextResponse.json({ key: shareKey, featured, reshared });
}
