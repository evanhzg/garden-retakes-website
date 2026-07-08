import { prisma } from "@/lib/db";

// Shared round-row fetching + aggregation for the player stats & compare pages.
// One DB fetch per player, all groupings (map / side / day) computed in JS.

export type RoundRow = {
  Map: string;
  PlayedAtUtc: Date;
  TeamNum: number;
  IsRanked: boolean;
  WonRound: boolean;
  Kills: number;
  Headshots: number;
  Assists: number;
  Damage: number;
  UtilityDamage: number;
  EnemiesFlashed: number;
  TradeKills: number;
  MultiKillCount: number;
  Died: boolean;
  Kast: boolean;
  OpeningKill: boolean;
  OpeningDeath: boolean;
  ClutchWon: boolean;
  BombPlanted: boolean;
  BombDefused: boolean;
  WasAfk: boolean;
  Rating: number;
};

export async function fetchRows(
  seasonId: number,
  steamId: bigint,
  rankedOnly: boolean
): Promise<RoundRow[]> {
  return prisma.playerRoundRecord.findMany({
    where: {
      SeasonId: seasonId,
      SteamId: steamId,
      ...(rankedOnly ? { IsRanked: true } : {}),
    },
    select: {
      Map: true,
      PlayedAtUtc: true,
      TeamNum: true,
      IsRanked: true,
      WonRound: true,
      Kills: true,
      Headshots: true,
      Assists: true,
      Damage: true,
      UtilityDamage: true,
      EnemiesFlashed: true,
      TradeKills: true,
      MultiKillCount: true,
      Died: true,
      Kast: true,
      OpeningKill: true,
      OpeningDeath: true,
      ClutchWon: true,
      BombPlanted: true,
      BombDefused: true,
      WasAfk: true,
      Rating: true,
    },
    orderBy: { PlayedAtUtc: "asc" },
  });
}

export type StatSummary = {
  rounds: number;
  wins: number;
  winPct: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  kpr: number;
  adr: number;
  kast: number;
  hs: number;
  rating: number;
  openingKills: number;
  openingDeaths: number;
  clutches: number;
  plants: number;
  defuses: number;
  multiKills: number;
  utilPerRound: number;
  enemiesFlashed: number;
  tradeKills: number;
};

export function summarize(rows: RoundRow[]): StatSummary {
  const rounds = rows.length;
  const wins = rows.filter((r) => r.WonRound).length;
  const kills = rows.reduce((sum, r) => sum + r.Kills, 0);
  const deaths = rows.filter((r) => r.Died).length;
  const assists = rows.reduce((sum, r) => sum + r.Assists, 0);
  const damage = rows.reduce((sum, r) => sum + r.Damage, 0);
  const util = rows.reduce((sum, r) => sum + r.UtilityDamage, 0);
  const headshots = rows.reduce((sum, r) => sum + r.Headshots, 0);
  const rated = rows.filter((r) => !r.WasAfk);
  const rating = rated.length
    ? rated.reduce((sum, r) => sum + r.Rating, 0) / rated.length
    : 0;

  return {
    rounds,
    wins,
    winPct: rounds ? (100 * wins) / rounds : 0,
    kills,
    deaths,
    assists,
    kd: deaths > 0 ? kills / deaths : kills,
    kpr: rounds ? kills / rounds : 0,
    adr: rounds ? damage / rounds : 0,
    kast: rounds ? (100 * rows.filter((r) => r.Kast).length) / rounds : 0,
    hs: kills ? (100 * headshots) / kills : 0,
    rating,
    openingKills: rows.filter((r) => r.OpeningKill).length,
    openingDeaths: rows.filter((r) => r.OpeningDeath).length,
    clutches: rows.filter((r) => r.ClutchWon).length,
    plants: rows.filter((r) => r.BombPlanted).length,
    defuses: rows.filter((r) => r.BombDefused).length,
    multiKills: rows.filter((r) => r.MultiKillCount >= 2).length,
    utilPerRound: rounds ? util / rounds : 0,
    enemiesFlashed: rows.reduce((sum, r) => sum + r.EnemiesFlashed, 0),
    tradeKills: rows.reduce((sum, r) => sum + r.TradeKills, 0),
  };
}

export function groupBy(rows: RoundRow[], key: (row: RoundRow) => string): [string, RoundRow[]][] {
  const map = new Map<string, RoundRow[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) {
      bucket.push(row);
    } else {
      map.set(k, [row]);
    }
  }
  return Array.from(map.entries());
}

export const sideName = (teamNum: number) => (teamNum === 2 ? "T" : "CT");

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** HLTV-style rating color class. */
export function ratingClass(rating: number): string {
  if (rating >= 1.05) return "rating-good";
  if (rating > 0 && rating <= 0.95) return "rating-bad";
  return "rating-neutral";
}
