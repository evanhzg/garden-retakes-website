import { prisma } from "@/lib/db";

/**
 * Season aggregates for the history table and the per-season page.
 *
 * The history table used to show four columns — name, dates, champion, best
 * ELO — so a season was a row you could not interrogate. These are the figures
 * that make one season comparable to another, and they are cheap: three
 * aggregate queries per season rather than a scan of every round record.
 */

export type SeasonTotals = {
  seasonId: number;
  players: number;
  rankedRounds: number;
  /** Whole rounds recorded, ranked or not. */
  totalRounds: number;
  avgElo: number | null;
  peakElo: number | null;
  avgAdr: number | null;
  avgKd: number | null;
  kills: number;
  deaths: number;
  days: number | null;
};

export async function seasonTotals(
  seasonId: number,
  startedAt: Date,
  endedAt: Date | null
): Promise<SeasonTotals> {
  const [standings, rounds, deaths] = await Promise.all([
    prisma.playerSeasonStats.aggregate({
      where: { SeasonId: seasonId, RankedRoundsPlayed: { gt: 0 } },
      _count: { _all: true },
      _avg: { Elo: true },
      _max: { PeakElo: true },
      _sum: { RankedRoundsPlayed: true },
    }),
    prisma.playerRoundRecord.aggregate({
      where: { SeasonId: seasonId },
      _count: { _all: true },
      _sum: { Kills: true, Damage: true },
    }),
    // Deaths are a boolean column, so they are a filtered count rather than a
    // sum — Prisma has no conditional aggregate.
    prisma.playerRoundRecord.count({ where: { SeasonId: seasonId, Died: true } }),
  ]);

  const totalRounds = rounds._count._all;
  const kills = rounds._sum.Kills ?? 0;
  const damage = rounds._sum.Damage ?? 0;

  const end = endedAt ?? new Date();
  const days = Math.max(1, Math.round((end.getTime() - startedAt.getTime()) / 86_400_000));

  return {
    seasonId,
    players: standings._count._all,
    rankedRounds: standings._sum.RankedRoundsPlayed ?? 0,
    totalRounds,
    avgElo: standings._avg.Elo ?? null,
    peakElo: standings._max.PeakElo ?? null,
    avgAdr: totalRounds ? damage / totalRounds : null,
    // A player with kills and no deaths scores their kill count, same rule the
    // ladder uses.
    avgKd: deaths > 0 ? kills / deaths : kills || null,
    kills,
    deaths,
    days,
  };
}
