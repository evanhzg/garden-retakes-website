import "server-only";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";
import type { LadderRow } from "@/components/home/LadderRows";

// The ladder query, lifted out of the homepage.
//
// It now has two callers — the stats page, where the full ladder lives, and the
// homepage, which shows only the podium. Duplicating a five-table join to show
// three rows instead of twenty is how the two quietly start disagreeing about
// who is first.

export async function ladderRows(seasonId: number, take = 20): Promise<LadderRow[]> {
  const ladder = await prisma.playerSeasonStats.findMany({
    where: { SeasonId: seasonId, RankedRoundsPlayed: { gt: 0 } },
    orderBy: { Elo: "desc" },
    take,
  });

  const ids = ladder.map((e) => e.SteamId);
  if (ids.length === 0) return [];

  // K/D, ADR and win rate for the hover readout. Prisma has no conditional
  // aggregate, so deaths and wins are their own grouped counts rather than a
  // sum over a computed column.
  const [totals, deaths, wins, names, avatars] = await Promise.all([
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: seasonId, IsRanked: true, SteamId: { in: ids } },
      _sum: { Kills: true, Damage: true },
      _count: { _all: true },
    }),
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: seasonId, IsRanked: true, SteamId: { in: ids }, Died: true },
      _count: { _all: true },
    }),
    prisma.playerRoundRecord.groupBy({
      by: ["SteamId"],
      where: { SeasonId: seasonId, IsRanked: true, SteamId: { in: ids }, WonRound: true },
      _count: { _all: true },
    }),
    resolveNames(ids),
    resolveAvatars(ids),
  ]);

  const totalOf = new Map(totals.map((t) => [t.SteamId.toString(), t]));
  const deathOf = new Map(deaths.map((d) => [d.SteamId.toString(), d._count._all]));
  const winOf = new Map(wins.map((w) => [w.SteamId.toString(), w._count._all]));
  const mySteamId = getSession()?.steamId ?? null;

  return ladder.map((e) => {
    const key = e.SteamId.toString();
    const t = totalOf.get(key);
    const rounds = t?._count._all ?? 0;
    const d = deathOf.get(key) ?? 0;
    const k = t?._sum.Kills ?? 0;
    return {
      steamId: key,
      name: nameFrom(names, e.SteamId),
      elo: e.Elo,
      avatar: avatars[key],
      // Deaths of 0 would divide by zero; a player with kills and no deaths
      // scores their kill count, which is what a K/D of "k/1" means anyway.
      kd: rounds ? k / Math.max(d, 1) : null,
      adr: rounds ? (t?._sum.Damage ?? 0) / rounds : null,
      winPct: rounds ? ((winOf.get(key) ?? 0) / rounds) * 100 : null,
      isYou: key === mySteamId,
    };
  });
}
