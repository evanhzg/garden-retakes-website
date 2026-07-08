import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toEquippedV4, type InventoryStore } from "@/lib/inventory";

export const dynamic = "force-dynamic";

// Public endpoint polled by the ianlucas cs2-inventory-simulator plugin:
//   GET /api/equipped/v4/{steamID64}.json
// Returns the player's active loadout in the plugin's exact econ-item shape.
export async function GET(
  _request: Request,
  { params }: { params: { steamid: string } }
) {
  const steamId = params.steamid.replace(/\.json$/i, "");
  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({}, { status: 400 });
  }

  const row = await prisma.webInventory.findUnique({
    where: { SteamId: BigInt(steamId) },
  });

  if (!row) return NextResponse.json({});

  try {
    const store = JSON.parse(row.Data) as InventoryStore;
    return NextResponse.json(toEquippedV4(store, store.activeLoadoutId));
  } catch {
    return NextResponse.json({});
  }
}
