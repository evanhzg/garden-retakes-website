import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normaliseStore, toEquippedV4, type GameIdResolver, type InventoryStore } from "@/lib/inventory";
import {
  toGameAgentDef,
  toGameKeychainDef,
  toGameMusicKitDef,
  toGameStickerDef,
} from "@/lib/economy";

export const dynamic = "force-dynamic";

// The website stores everything by cs2-lib item id, because that is the key its
// own catalog, previews and saved loadouts are built on. The game addresses
// agents by item definition index and charms by keychain index, which are
// different numbers for the same item. This is the only place the two meet, so
// the translation lives here rather than in the shared model — which also runs
// in the browser, where the catalog is not available.
const GAME_IDS: GameIdResolver = {
  agentDef: toGameAgentDef,
  stickerDef: toGameStickerDef,
  keychainDef: toGameKeychainDef,
  musicKitDef: toGameMusicKitDef,
};

// Public endpoint polled by the Garden-inventory plugin:
//   GET /api/equipped/v4/{steamID64}.json[?loadout=name]
// Returns the player's loadout (active one, or the ?loadout= name/id override)
// in the plugin's exact econ-item shape, including per-side weapons, knives,
// gloves and agents (with their patches).
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
    return NextResponse.json(toEquippedV4(store, loadoutRef, GAME_IDS));
  } catch {
    return NextResponse.json({});
  }
}
