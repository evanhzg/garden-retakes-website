import { prisma } from "@/lib/db";
import { dayKey, summarize, type RoundRow } from "@/lib/stats";

// W2 hero section: the standout performance of the most recent play session.
// "Session" = all rounds recorded on the latest calendar day (UTC) that has
// data. Among players with enough rounds that day, the highest HLTV rating wins.

export type Standout = {
  steamId: string;
  name: string;
  avatarUrl: string | null;
  day: string;
  elo: number | null;
  rating: number;
  rounds: number;
  kd: number;
  kills: number;
  deaths: number;
  adr: number;
  winPct: number;
  clutches: number;
  openingKills: number;
};

const MIN_ROUNDS = 8;

export async function getLastSessionStandout(seasonId: number): Promise<Standout | null> {
  const latest = await prisma.playerRoundRecord.findFirst({
    where: { SeasonId: seasonId },
    orderBy: { PlayedAtUtc: "desc" },
    select: { PlayedAtUtc: true },
  });
  if (!latest) return null;

  // Bound to the UTC day of the latest round.
  const end = latest.PlayedAtUtc;
  const dayStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await prisma.playerRoundRecord.findMany({
    where: { SeasonId: seasonId, PlayedAtUtc: { gte: dayStart, lt: dayEnd } },
    select: {
      SteamId: true,
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
  });
  if (rows.length === 0) return null;

  const byPlayer = new Map<string, RoundRow[]>();
  for (const r of rows) {
    const key = r.SteamId.toString();
    const bucket = byPlayer.get(key);
    if (bucket) bucket.push(r as RoundRow);
    else byPlayer.set(key, [r as RoundRow]);
  }

  let best: { steamId: string; summary: ReturnType<typeof summarize> } | null = null;
  for (const [steamId, playerRows] of Array.from(byPlayer.entries())) {
    const rated = playerRows.filter((r: RoundRow) => !r.WasAfk);
    if (rated.length < MIN_ROUNDS) continue;
    const summary = summarize(playerRows);
    if (!best || summary.rating > best.summary.rating) best = { steamId, summary };
  }
  if (!best) return null;

  const id = BigInt(best.steamId);
  const [override, profile, webProfile, stats] = await Promise.all([
    prisma.gardenNameOverride.findUnique({ where: { SteamId: id } }),
    prisma.playerProfile.findUnique({ where: { SteamId: id } }),
    prisma.gardenWebProfile.findUnique({ where: { SteamId: id } }),
    prisma.playerSeasonStats.findFirst({ where: { SeasonId: seasonId, SteamId: id } }),
  ]);

  const s = best.summary;
  return {
    steamId: best.steamId,
    name: override?.Name ?? profile?.LastKnownName ?? best.steamId,
    avatarUrl: webProfile?.AvatarUrl ?? null,
    day: dayKey(end),
    elo: stats?.Elo ?? null,
    rating: s.rating,
    rounds: s.rounds,
    kd: s.kd,
    kills: s.kills,
    deaths: s.deaths,
    adr: s.adr,
    winPct: s.winPct,
    clutches: s.clutches,
    openingKills: s.openingKills,
  };
}
