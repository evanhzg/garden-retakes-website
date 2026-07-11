import { getActiveSeason, prisma } from "@/lib/db";
import { fetchRows, ratingClass, summarize, StatSummary } from "@/lib/stats";

export const revalidate = 30;

type Metric = {
  label: string;
  value: (s: StatSummary) => number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
};

import CompareInteractive from "@/components/CompareInteractive";

const METRICS = [
  { label: "Rating", key: "rating", format: "fixed2" },
  { label: "K/D", key: "kd", format: "fixed2" },
  { label: "ADR", key: "adr", format: "fixed0" },
  { label: "KAST %", key: "kast", format: "pct" },
  { label: "HS %", key: "hs", format: "pct" },
  { label: "Round win %", key: "winPct", format: "pct" },
  { label: "Kills / round", key: "kpr", format: "fixed2" },
  { label: "Opening kills", key: "openingKills", format: "raw" },
  { label: "Clutches won", key: "clutches", format: "raw" },
  { label: "Multi-kill rounds", key: "multiKills", format: "raw" },
  { label: "Util dmg / round", key: "utilPerRound", format: "fixed1" },
  { label: "Rounds played", key: "rounds", format: "raw" },
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string; ranked?: string };
}) {
  const season = await getActiveSeason();
  const seasonId = season?.Id ?? 0;
  const rankedOnly = searchParams.ranked === "1";

  // Ladder players for the pick lists.
  const ladderRaw = await prisma.playerSeasonStats.findMany({
    where: { SeasonId: seasonId },
    orderBy: { Elo: "desc" },
    take: 100,
  });
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: ladderRaw.map((entry) => entry.SteamId) } },
  });
  const nameOf = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName]));

  const ladder = ladderRaw.map((entry, idx) => ({
    steamId: entry.SteamId.toString(),
    name: nameOf.get(entry.SteamId.toString()) ?? entry.SteamId.toString(),
    elo: entry.Elo,
    peakElo: entry.PeakElo,
    rank: idx + 1,
  }));

  const parseId = (value?: string) => {
    try {
      return value ? BigInt(value) : null;
    } catch {
      return null;
    }
  };

  const idA = parseId(searchParams.a);
  const idB = parseId(searchParams.b);

  const [rowsA, rowsB] = await Promise.all([
    idA ? fetchRows(seasonId, idA, rankedOnly) : null,
    idB ? fetchRows(seasonId, idB, rankedOnly) : null,
  ]);

  const statsA = rowsA ? summarize(rowsA) : null;
  const statsB = rowsB ? summarize(rowsB) : null;

  // Group rows by Map
  const groupByMap = (rows: any[]) => {
    return rows.reduce((acc, row) => {
      if (!acc[row.Map]) acc[row.Map] = [];
      acc[row.Map].push(row);
      return acc;
    }, {});
  };

  const mapStatsA = rowsA ? Object.fromEntries(
    Object.entries(groupByMap(rowsA)).map(([m, r]: [string, any]) => [m, summarize(r)])
  ) : null;

  const mapStatsB = rowsB ? Object.fromEntries(
    Object.entries(groupByMap(rowsB)).map(([m, r]: [string, any]) => [m, summarize(r)])
  ) : null;

  const nameA = idA ? nameOf.get(idA.toString()) ?? searchParams.a : null;
  const nameB = idB ? nameOf.get(idB.toString()) ?? searchParams.b : null;

  const playerAInfo = ladder.find((p) => p.steamId === searchParams.a);
  const playerBInfo = ladder.find((p) => p.steamId === searchParams.b);

  return (
    <CompareInteractive
      ladder={ladder}
      seasonName={season?.Name ?? "no season"}
      statsA={statsA}
      statsB={statsB}
      mapStatsA={mapStatsA}
      mapStatsB={mapStatsB}
      nameA={nameA ?? null}
      nameB={nameB ?? null}
      playerAInfo={playerAInfo}
      playerBInfo={playerBInfo}
      metrics={METRICS}
      rankedOnly={rankedOnly}
    />
  );
}
