import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normaliseStore, toEquippedV4, type InventoryStore } from "@/lib/inventory";

export const dynamic = "force-dynamic";

// Public endpoint polled by the Garden-inventory plugin:
//   GET /api/equipped/v4/{steamID64}.json[?loadout=name]
// Returns the player's loadout (active one, or the ?loadout= name/id override)
// in the plugin's exact econ-item shape, including per-side weapons, knives
// and gloves.
export async function GET(
  request: Request,
  { params }: { params: { steamid: string } }
) {
  const steamId = params.steamid.replace(/\.json$/i, "");
  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({}, { status: 400 });
  }

  const loadoutRef = new URL(request.url).searchParams.get("loadout");

  const row = await prisma.webInventory.findUnique({
    where: { SteamId: BigInt(steamId) },
  });

  if (!row) return NextResponse.json({});

  try {
    const store = normaliseStore(JSON.parse(row.Data) as InventoryStore);
    return NextResponse.json(toEquippedV4(store, loadoutRef));
  } catch {
    return NextResponse.json({});
  }
}
