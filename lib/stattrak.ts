import { prisma, getActiveSeason } from "@/lib/db";

/**
 * StatTrak, per season.
 *
 * Two numbers live here and they answer different questions.
 *
 * The **item count** is what CS2 paints on the side of the gun: kills with this
 * one weapon. The website never stored it — `/api/equipped/v4` sent `stattrak:
 * 0` for every StatTrak item — so a counter a player watched climb all evening
 * was back at zero the next time the plugin re-read their loadout. It had
 * nowhere to go: `/api/increment-item-stattrak`, which the plugin POSTs on
 * every kill, was never implemented and answered 404 for months.
 *
 * The **season count** is the player's kills this season with anything at all,
 * StatTrak or not, which is the number that actually says how much someone has
 * played. It is not stored: `PlayerRoundRecords` already has a `Kills` column
 * per player per round with a `[SeasonId, SteamId]` index on it, and a second
 * copy of a number that is already written every round is a second copy that
 * can disagree with the first.
 *
 * Both are scoped to the active season. A counter that never resets is one
 * nobody can catch up with, and it makes a knife carried since season 1
 * incomparable with anything a player who joined last month owns.
 */

export type StatTrakSummary = {
  /** The season these numbers belong to, or null if no season is running. */
  seasonId: number | null;
  seasonName: string | null;
  /** Kills this season with anything, from the round records. */
  seasonKills: number;
  /** uid → kills with that item this season. Only items with a kill appear. */
  itemKills: Record<number, number>;
};

/**
 * Kills this season, from the round records rather than a counter of our own.
 *
 * Every round the plugin writes one `PlayerRoundRecord` per player with the
 * kills they got in it, ranked or not — so the sum is the honest answer and it
 * cannot drift from what the ladder and the profile pages show, because it is
 * the same column they read.
 */
export async function seasonKills(steamId: bigint, seasonId: number): Promise<number> {
  const agg = await prisma.playerRoundRecord.aggregate({
    where: { SeasonId: seasonId, SteamId: steamId },
    _sum: { Kills: true },
  });
  return agg._sum.Kills ?? 0;
}

/**
 * Every StatTrak counter this player has going this season, keyed by the uid
 * the plugin addresses items with.
 *
 * One query for the whole loadout rather than one per weapon: `/api/equipped/v4`
 * is polled on connect and on every `!ws`, and a player can have a dozen
 * StatTrak items equipped across both sides.
 */
export async function itemKills(
  steamId: bigint,
  seasonId: number
): Promise<Record<number, number>> {
  const rows = await prisma.gardenStatTrakCount.findMany({
    where: { SeasonId: seasonId, SteamId: steamId },
    select: { Uid: true, Kills: true },
  });

  const out: Record<number, number> = {};
  for (const row of rows) out[row.Uid] = row.Kills;
  return out;
}

/** Both numbers, for the active season, in one place. */
export async function statTrakSummary(steamId: bigint): Promise<StatTrakSummary> {
  const season = await getActiveSeason();
  if (!season) {
    // Between seasons there is nothing to count towards. Reporting zeroes with
    // a null season is honest; inventing a season id would file kills under
    // whichever one happened to be last.
    return { seasonId: null, seasonName: null, seasonKills: 0, itemKills: {} };
  }

  const [kills, items] = await Promise.all([
    seasonKills(steamId, season.Id),
    itemKills(steamId, season.Id),
  ]);

  return {
    seasonId: season.Id,
    seasonName: season.Name,
    seasonKills: kills,
    itemKills: items,
  };
}

/**
 * Add one kill to an item's counter for the active season.
 *
 * Returns the new item count and the player's season kills, or null when no
 * season is running — the plugin has already painted the incremented number on
 * the weapon by the time it calls this, so the answer is a reconciliation, not
 * a permission.
 *
 * The upsert is the whole concurrency story: `@@unique([SeasonId, SteamId, Uid])`
 * means two kills landing at once cannot create two rows, and the `increment`
 * is done by the database rather than by reading and writing back, so they
 * cannot lose each other either.
 */
export async function incrementItemKill(
  steamId: bigint,
  uid: number
): Promise<{ seasonId: number; seasonName: string; kills: number; seasonKills: number } | null> {
  const season = await getActiveSeason();
  if (!season) return null;

  const row = await prisma.gardenStatTrakCount.upsert({
    where: { SeasonId_SteamId_Uid: { SeasonId: season.Id, SteamId: steamId, Uid: uid } },
    create: { SeasonId: season.Id, SteamId: steamId, Uid: uid, Kills: 1 },
    update: { Kills: { increment: 1 } },
    select: { Kills: true },
  });

  return {
    seasonId: season.Id,
    seasonName: season.Name,
    kills: row.Kills,
    seasonKills: await seasonKills(steamId, season.Id),
  };
}
