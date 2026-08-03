import fs from "fs";
import path from "path";
import { getActiveSeason, prisma } from "@/lib/db";
import { fetchRows, ratingClass, summarize, dayKey, StatSummary, RoundRow } from "@/lib/stats";
import { getT } from "@/lib/serverI18n";

export const revalidate = 30;

type Metric = {
  label: string;
  value: (s: StatSummary) => number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
};

import CompareInteractive from "@/components/CompareInteractive";

// Note: METRICS labels need to be translated at runtime if they are passed down.
// Since CompareInteractive is a client component, maybe we should pass translated labels 
// from here, or translate them here.

const getMetrics = (t: any) => [
  { label: t("stats.compare.rating"), key: "rating", format: "fixed2" },
  { label: t("stats.compare.kd"), key: "kd", format: "fixed2" },
  { label: t("stats.compare.adr"), key: "adr", format: "fixed0" },
  { label: t("stats.compare.kast"), key: "kast", format: "pct" },
  { label: t("stats.compare.hs"), key: "hs", format: "pct" },
  { label: t("stats.compare.winPct"), key: "winPct", format: "pct" },
  { label: t("stats.compare.kpr"), key: "kpr", format: "fixed2" },
  { label: t("stats.compare.assists"), key: "assists", format: "raw" },
  { label: t("stats.compare.openingKills"), key: "openingKills", format: "raw" },
  { label: t("stats.compare.openingDeaths"), key: "openingDeaths", format: "raw", lowerIsBetter: true },
  { label: t("stats.compare.clutches"), key: "clutches", format: "raw" },
  { label: t("stats.compare.multiKills"), key: "multiKills", format: "raw" },
  { label: t("stats.compare.tradeKills"), key: "tradeKills", format: "raw" },
  { label: t("stats.compare.enemiesFlashed"), key: "enemiesFlashed", format: "raw" },
  { label: t("stats.compare.plants"), key: "plants", format: "raw" },
  { label: t("stats.compare.defuses"), key: "defuses", format: "raw" },
  { label: t("stats.compare.utilPerRound"), key: "utilPerRound", format: "fixed1" },
  { label: t("stats.compare.roundsPlayed"), key: "rounds", format: "raw" },
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string; ranked?: string };
}) {
  const t = await getT();
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

  const ladder = ladderRaw.map((entry, idx) => {
    const idStr = entry.SteamId.toString();
    const filePath = path.join(process.cwd(), "public", `${idStr}_pp.png`);
    const exists = fs.existsSync(filePath);
    
    return {
      steamId: idStr,
      name: nameOf.get(idStr) ?? idStr,
      elo: entry.Elo,
      peakElo: entry.PeakElo,
      rank: idx + 1,
      avatarSrc: exists ? `/${idStr}_pp.png` : "/default_pp.png",
    };
  });

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

  // T/CT side splits for each player
  const sideSplit = (rows: RoundRow[] | null) =>
    rows
      ? {
          t: summarize(rows.filter((r) => r.TeamNum === 2)),
          ct: summarize(rows.filter((r) => r.TeamNum === 3)),
        }
      : null;
  const sidesA = sideSplit(rowsA);
  const sidesB = sideSplit(rowsB);

  // Daily average rating series (shared day axis, last 14 active days)
  const dayAvg = (rows: RoundRow[] | null) => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of rows ?? []) {
      if (r.WasAfk) continue;
      const k = dayKey(r.PlayedAtUtc);
      const cur = map.get(k) ?? { sum: 0, n: 0 };
      cur.sum += r.Rating;
      cur.n += 1;
      map.set(k, cur);
    }
    return map;
  };
  const daysA = dayAvg(rowsA);
  const daysB = dayAvg(rowsB);
  const sharedDays = Array.from(
    new Set([...Array.from(daysA.keys()), ...Array.from(daysB.keys())])
  ).sort().slice(-14);
  const trendPoints = sharedDays.map((d) => ({
    label: d.slice(5),
    a: daysA.has(d) ? daysA.get(d)!.sum / daysA.get(d)!.n : null,
    b: daysB.has(d) ? daysB.get(d)!.sum / daysB.get(d)!.n : null,
  }));

  const nameA = idA ? nameOf.get(idA.toString()) ?? searchParams.a : null;
  const nameB = idB ? nameOf.get(idB.toString()) ?? searchParams.b : null;

  const playerAInfo = ladder.find((p) => p.steamId === searchParams.a);
  const playerBInfo = ladder.find((p) => p.steamId === searchParams.b);

  return (
    <CompareInteractive
      ladder={ladder}
      seasonName={season?.Name ?? t("stats.compare.noSeason")}
      statsA={statsA}
      statsB={statsB}
      mapStatsA={mapStatsA}
      mapStatsB={mapStatsB}
      sidesA={sidesA}
      sidesB={sidesB}
      trendPoints={trendPoints}
      nameA={nameA ?? null}
      nameB={nameB ?? null}
      playerAInfo={playerAInfo}
      playerBInfo={playerBInfo}
      metrics={getMetrics(t)}
      rankedOnly={rankedOnly}
    />
  );
}
