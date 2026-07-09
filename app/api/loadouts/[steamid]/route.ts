import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normaliseStore, type InventoryStore } from "@/lib/inventory";

export const dynamic = "force-dynamic";

// Public endpoint used by the Garden-inventory plugin (R9 loadout UX):
//   GET /api/loadouts/{steamID64}.json
// Returns the player's loadout names and which one is active:
//   { "loadouts": [{ "id": "...", "name": "green", "active": true }, ...] }
export async function GET(
  _request: Request,
  { params }: { params: { steamid: string } }
) {
  const steamId = params.steamid.replace(/\.json$/i, "");
  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({ loadouts: [] }, { status: 400 });
  }

  const row = await prisma.webInventory.findUnique({
    where: { SteamId: BigInt(steamId) },
  });

  if (!row) return NextResponse.json({ loadouts: [] });

  try {
    const store = normaliseStore(JSON.parse(row.Data) as InventoryStore);
    return NextResponse.json({
      loadouts: store.loadouts.map((l) => ({
        id: l.id,
        name: l.name,
        active: l.id === store.activeLoadoutId,
      })),
    });
  } catch {
    return NextResponse.json({ loadouts: [] });
  }
}
