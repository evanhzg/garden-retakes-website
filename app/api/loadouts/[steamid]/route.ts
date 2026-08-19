import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normaliseStore, type InventoryStore } from "@/lib/inventory";
import { statTrakSummary } from "@/lib/stattrak";

export const dynamic = "force-dynamic";

// Public endpoint used by the Garden-inventory plugin (R9 loadout UX):
//   GET /api/loadouts/{steamID64}.json
// Returns the player's loadout names and which one is active, plus how their
// season is going:
//   { "season": "Season 5", "seasonKills": 412,
//     "loadouts": [{ "id": "...", "name": "green", "active": true }, ...] }
//
// The season figures ride along because this is what the in-game loadout menu
// already fetches to draw itself, and a second round trip to put a number in
// its header would be a second round trip on every menu open.
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

  const stats = await statTrakSummary(BigInt(steamId));

  if (!row) {
    return NextResponse.json({
      loadouts: [],
      season: stats.seasonName,
      seasonKills: stats.seasonKills,
    });
  }

  try {
    const store = normaliseStore(JSON.parse(row.Data) as InventoryStore);
    return NextResponse.json({
      season: stats.seasonName,
      seasonKills: stats.seasonKills,
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
