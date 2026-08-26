// Tournament statistics.
//
// The aggregation is deliberately separate from the fetching. One row is
// written per (match, map, player), so every figure a table shows is a sum or a
// ratio over a set of those rows — and the two ratios that are easy to get
// wrong are rating and KAST, because both are per-round and neither can be
// averaged by averaging the averages. A player who went 1.40 over 12 rounds and
// 0.60 over 30 did not have a 1.00 tournament.
//
// So: sums are sums, and anything per-round is divided by the rounds that
// produced it. `aggregate` has no imports and is where that is tested.

export type StatRow = {
  steamId: string;
  teamId: number | null;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  utilityDamage: number;
  entryKills: number;
  entryDeaths: number;
  clutches: number;
  roundsPlayed: number;
  kastRounds: number;
  rating: number;
  maps: number;
};

export type PlayerTotals = StatRow & {
  name: string;
  kd: number;
  adr: number;
  /** Percentages, 0–100. */
  kast: number;
  hs: number;
  /** Rounds-weighted, not a mean of means. */
  ratingAvg: number;
};

const empty = (steamId: string, teamId: number | null): StatRow => ({
  steamId,
  teamId,
  kills: 0,
  deaths: 0,
  assists: 0,
  headshots: 0,
  damage: 0,
  utilityDamage: 0,
  entryKills: 0,
  entryDeaths: 0,
  clutches: 0,
  roundsPlayed: 0,
  kastRounds: 0,
  rating: 0,
  maps: 0,
});

/**
 * Sum a set of per-map rows into one row per player.
 *
 * `rating` accumulates as rating × rounds so the division at the end is a true
 * weighted mean; `ratingAvg` is the figure to show and `rating` is left as the
 * accumulator so nothing downstream mistakes one for the other.
 */
export function aggregate(rows: StatRow[], names: Record<string, string> = {}): PlayerTotals[] {
  const byPlayer = new Map<string, StatRow>();

  for (const row of rows) {
    const acc = byPlayer.get(row.steamId) ?? empty(row.steamId, row.teamId);

    acc.teamId = acc.teamId ?? row.teamId;
    acc.kills += row.kills;
    acc.deaths += row.deaths;
    acc.assists += row.assists;
    acc.headshots += row.headshots;
    acc.damage += row.damage;
    acc.utilityDamage += row.utilityDamage;
    acc.entryKills += row.entryKills;
    acc.entryDeaths += row.entryDeaths;
    acc.clutches += row.clutches;
    acc.roundsPlayed += row.roundsPlayed;
    acc.kastRounds += row.kastRounds;
    acc.rating += row.rating * row.roundsPlayed;
    acc.maps += 1;

    byPlayer.set(row.steamId, acc);
  }

  return Array.from(byPlayer.values())
    .map((acc) => {
      const rounds = Math.max(1, acc.roundsPlayed);
      return {
        ...acc,
        name: names[acc.steamId] ?? acc.steamId,
        // Deaths of zero is a real result over a short series, and dividing by
        // it would print Infinity on a table people screenshot.
        kd: acc.deaths === 0 ? acc.kills : Math.round((acc.kills / acc.deaths) * 100) / 100,
        adr: Math.round(acc.damage / rounds),
        kast: Math.round((acc.kastRounds / rounds) * 100),
        hs: acc.kills === 0 ? 0 : Math.round((acc.headshots / acc.kills) * 100),
        ratingAvg: Math.round((acc.rating / rounds) * 100) / 100,
      };
    })
    .sort((a, b) => b.ratingAvg - a.ratingAvg || b.kills - a.kills);
}

/** One player's line across every tournament they have played. */
export type TournamentAppearance = {
  tournamentId: number;
  slug: string;
  name: string;
  state: string;
  teamName: string | null;
  placement: number | null;
  totals: PlayerTotals;
};
