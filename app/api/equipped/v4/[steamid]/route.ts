import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normaliseStore, toEquippedV4, type GameIdResolver, type InventoryStore } from "@/lib/inventory";
import { statTrakSummary } from "@/lib/stattrak";
import {
  clampWear,
  sanitisePlacement,
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
//
// StatTrak counts come from this season's counters rather than being sent as
// zero, which is what they were until the counters existed — every gun's kill
// count was rebuilt from nothing on each fetch, so no kill survived a
// reconnect, a map change or an `!ws`.
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

    // Put every wear inside the range its own skin allows, on the way out.
    //
    // A skin's wear runs between its wearMin and wearMax — a Factory New-only
    // finish starts at 0.06, not 0 — and cs2-lib treats an absent wear as the
    // minimum for that skin rather than zero. The cstrike importer stored zero,
    // so most imported items ask the game to paint a weapon at a wear its
    // material has no variant for. Clamping here fixes every inventory already
    // saved; the importer is fixed too, but that only helps future imports.
    for (const item of store.items) {
      item.wear = clampWear(item.skinId, item.wear);

      // And drop placements in the wrong coordinate system. The editor stores
      // sticker x/y as a percentage of its 2D preview stage; the game wants its
      // own offsets. Sending one as the other is what puts stickers at random
      // points on a weapon.
      for (const sticker of item.stickers) {
        if (sticker) sanitisePlacement(item.skinId, sticker, "sticker");
      }
      if (item.charm) sanitisePlacement(item.skinId, item.charm, "charm");
    }

    const stats = await statTrakSummary(BigInt(steamId));
    return NextResponse.json({
      ...toEquippedV4(store, loadoutRef, GAME_IDS, stats.itemKills),
      // Extra keys the plugin's model ignores when it does not know them, so
      // this is safe to send to an old build. The plugin reads them to tell a
      // player how their season is going without a second request.
      season: stats.seasonName,
      seasonKills: stats.seasonKills,
    });
  } catch {
    return NextResponse.json({});
  }
}
