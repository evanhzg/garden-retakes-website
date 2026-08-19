import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { statTrakSummary } from "@/lib/stattrak";

export const dynamic = "force-dynamic";

// GET: the signed-in player's StatTrak figures for the running season.
//
//   { season, seasonId, seasonKills, itemKills: { "<uid>": kills } }
//
// Deliberately not folded into GET /api/inventory: that returns the saved
// InventoryStore and the client hands it straight to normaliseStore, so extra
// keys there would be keys the store has to start ignoring. Counts also have a
// different lifetime — they move on every kill, where the store only changes
// when somebody edits a loadout.
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const stats = await statTrakSummary(BigInt(session.steamId));
  return NextResponse.json({
    season: stats.seasonName,
    seasonId: stats.seasonId,
    // Kills with anything this season — the player, not the gun.
    seasonKills: stats.seasonKills,
    // uid → kills with that one item this season.
    itemKills: stats.itemKills,
  });
}
