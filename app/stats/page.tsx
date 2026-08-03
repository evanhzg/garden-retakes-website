import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { summarize, dayKey, formatDate } from "@/lib/stats";
import { resolveNames, nameFrom, NameMap } from "@/lib/names";
import AvatarImage from "@/components/AvatarImage";
import { Columns, HBars, SideSplitBars, Histogram } from "@/components/stats/charts";
import LeaderboardTabs from "@/components/stats/LeaderboardTabs";
import HowRatingWorks from "@/components/stats/HowRatingWorks";
import LadderRows from "@/components/home/LadderRows";
import { ladderRows } from "@/lib/ladder";
import { getT } from "@/lib/serverI18n";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function StatsPage() {
  // Declared first: the no-season early return below also translates, and
  // charts.tsx takes its legend strings as a prop because it is a client
  // component and cannot reach the server dictionary itself.
  const t = getT();
  const season = await getActiveSeason();
  if (!season) {
    return (
      <section className="panel">
        <h2>{t("auto.page.global_stats")}</h2>
        <p className="muted">{t("auto.page.no_active_season_found")}</p>
      </section>
    );
  }

  // One fetch feeds everything: leaderboards, tiles and charts.
  const allRows = await prisma.playerRoundRecord.findMany({
    where: { SeasonId: season.Id, IsRanked: true },
    select: {
      SteamId: true, Map: true, PlayedAtUtc: true, TeamNum: true, IsRanked: true, WonRound: true,
      Kills: true, Headshots: true, Assists: true, Damage: true, UtilityDamage: true,
      EnemiesFlashed: true, TradeKills: true, MultiKillCount: true, Died: true,
      Kast: true, OpeningKill: true, OpeningDeath: true, ClutchWon: true,
      BombPlanted: true, BombDefused: true, WasAfk: true, Rating: true
    }
  });

  const byPlayer = new Map<string, typeof allRows>();
  for (const r of allRows) {
    const key = r.SteamId.toString();
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key)!.push(r);
  }

  const playerStats = Array.from(byPlayer.entries())
    .map(([steamId, rows]) => ({ steamId, summary: summarize(rows) }))
    .filter(p => p.summary.rounds >= 10); // Minimum 10 rounds to qualify

  /* ---------- Server totals (tiles) ---------- */
  // Server rounds = per-player rows deduped by (map, timestamp)
  const roundKeys = new Set(allRows.map(r => `${r.Map}|${r.PlayedAtUtc.getTime()}`));
  const totals = {
    rounds: roundKeys.size,
    players: byPlayer.size,
    kills: allRows.reduce((s, r) => s + r.Kills, 0),
    damage: allRows.reduce((s, r) => s + r.Damage, 0),
    clutches: allRows.filter(r => r.ClutchWon).length,
    plants: allRows.filter(r => r.BombPlanted).length,
    defuses: allRows.filter(r => r.BombDefused).length,
    aces: allRows.filter(r => r.MultiKillCount >= 4).length,
  };

  /* ---------- Activity: server rounds per day, last 14 days ---------- */
  const roundsByDay = new Map<string, Set<string>>();
  for (const r of allRows) {
    const d = dayKey(r.PlayedAtUtc);
    if (!roundsByDay.has(d)) roundsByDay.set(d, new Set());
    roundsByDay.get(d)!.add(`${r.Map}|${r.PlayedAtUtc.getTime()}`);
  }
  const today = new Date();
  const activity = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    const k = dayKey(d);
    return { label: k.slice(5), value: roundsByDay.get(k)?.size ?? 0, hint: "rounds played" };
  });

  /* ---------- Maps: share + T/CT balance (server-wide, deduped rounds) ---------- */
  const mapRounds = new Map<string, { key: string; tWin: boolean }[]>();
  const seenRound = new Set<string>();
  for (const r of allRows) {
    const key = `${r.Map}|${r.PlayedAtUtc.getTime()}`;
    if (seenRound.has(key)) continue;
    seenRound.add(key);
    // This row's team won or lost the round; derive the T-win flag from it
    const tWon = (r.TeamNum === 2) === r.WonRound;
    if (!mapRounds.has(r.Map)) mapRounds.set(r.Map, []);
    mapRounds.get(r.Map)!.push({ key, tWin: tWon });
  }
  const mapShare = Array.from(mapRounds.entries())
    .map(([map, rounds]) => ({ label: map.replace("de_", ""), value: rounds.length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const mapBalance = Array.from(mapRounds.entries())
    .filter(([, rounds]) => rounds.length >= 20)
    .map(([map, rounds]) => ({
      label: map.replace("de_", ""),
      tWinPct: (100 * rounds.filter(r => r.tWin).length) / rounds.length,
      ctWinPct: (100 * rounds.filter(r => !r.tWin).length) / rounds.length,
      rounds: rounds.length,
    }))
    .sort((a, b) => b.rounds - a.rounds);

  /* ---------- Rating distribution across qualified players ---------- */
  const bucketEdges = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4];
  const ratingBuckets = bucketEdges.slice(0, -1).map((lo, i) => {
    const hi = bucketEdges[i + 1];
    const inBucket = playerStats.filter(p => p.summary.rating >= lo && p.summary.rating < hi);
    return {
      label: lo.toFixed(1),
      count: inBucket.length,
      hint: `players rated ${lo.toFixed(2)}–${hi.toFixed(2)}`,
    };
  });
  ratingBuckets[0].count += playerStats.filter(p => p.summary.rating < 0.6).length;
  ratingBuckets[ratingBuckets.length - 1].count += playerStats.filter(p => p.summary.rating >= 1.4).length;

  /* ---------- Leaderboards ---------- */
  const top = (value: (s: ReturnType<typeof summarize>) => number, filter?: (s: ReturnType<typeof summarize>) => boolean) =>
    [...playerStats]
      .filter(p => (filter ? filter(p.summary) : true))
      .map(p => ({ steamId: p.steamId, value: value(p.summary) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

  // Ten boards, shown one at a time as tabs over a single table rather than ten
  // stacked tables of the same five players. `unit` labels the value column so
  // the number is readable without the board title above it.
  const boards: {
    title: string;
    unit: string;
    rows: { steamId: string; value: number }[];
    format: (v: number) => string;
  }[] = [
    { title: "ADR", unit: "ADR", rows: top(s => s.adr), format: v => v.toFixed(0) },
    { title: "Clutches", unit: "Clutches", rows: top(s => s.clutches), format: v => String(v) },
    {
      title: "Entry",
      unit: "Opening kill %",
      rows: top(
        s => (100 * s.openingKills) / Math.max(1, s.openingKills + s.openingDeaths),
        s => s.openingKills + s.openingDeaths >= 5
      ),
      format: v => `${v.toFixed(1)}%`,
    },
    { title: "KAST", unit: "KAST", rows: top(s => s.kast), format: v => `${v.toFixed(1)}%` },
    { title: "Headshots", unit: "HS %", rows: top(s => s.hs, s => s.kills >= 50), format: v => `${v.toFixed(1)}%` },
    { title: "Utility", unit: "Util dmg / round", rows: top(s => s.utilPerRound), format: v => v.toFixed(1) },
    { title: "Trades", unit: "Trade kills", rows: top(s => s.tradeKills), format: v => String(v) },
    { title: "Bomb", unit: "Plants + defuses", rows: top(s => s.plants + s.defuses), format: v => String(v) },
    { title: "Multi-kills", unit: "Multi-kill rounds", rows: top(s => s.multiKills), format: v => String(v) },
    { title: "Rounds", unit: "Rounds played", rows: top(s => s.rounds), format: v => String(v) },
  ];

  const idsToResolve = Array.from(new Set(boards.flatMap(b => b.rows.map(r => BigInt(r.steamId)))));
  const names = await resolveNames(idsToResolve);

  // The ladder used to be the homepage's centrepiece. It belongs with the rest
  // of the numbers; the homepage keeps a three-row peek.
  const ladder = await ladderRows(season.Id, 20);

  return (
    <>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="stats-ladder-head">
          <h3 style={{ margin: 0 }}>{t("auto.page.ladder")} {season.Name ?? `Season ${season.Id}`}</h3>
          <span className="muted" style={{ fontSize: 12 }}>{t("auto.page.hover_a_row_for_the_readout")}</span>
        </div>
        <LadderRows rows={ladder} />
      </section>

      {/* ---------- Season totals ---------- */}
      <section className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 14 }}>{season.Name} {t("auto.page._server_totals_ranked")}</h3>
        <div className="stat-tiles">
          <div className="stat-tile accent"><strong>{totals.rounds.toLocaleString()}</strong><span>{t("auto.page.rounds")}</span></div>
          <div className="stat-tile"><strong>{totals.players}</strong><span>{t("auto.page.players")}</span></div>
          <div className="stat-tile"><strong>{totals.kills.toLocaleString()}</strong><span>{t("auto.page.kills")}</span></div>
          <div className="stat-tile"><strong>{Math.round(totals.damage / 1000).toLocaleString()}k</strong><span>{t("auto.page.damage")}</span></div>
          <div className="stat-tile"><strong>{totals.clutches}</strong><span>{t("auto.page.clutches")}</span></div>
          <div className="stat-tile"><strong>{totals.plants}</strong><span>{t("auto.page.plants")}</span></div>
          <div className="stat-tile"><strong>{totals.defuses}</strong><span>{t("auto.page.defuses")}</span></div>
          <div className="stat-tile accent"><strong>{totals.aces}</strong><span>{t("auto.page.4k_rounds")}</span></div>
        </div>
      </section>

      <HowRatingWorks />

      {/* ---------- Activity + rating distribution ---------- */}
      <div className="chart-grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3 style={{ marginBottom: 10 }}>{t("auto.page.rounds_per_day_last_14_days")}</h3>
          <Columns data={activity} color="var(--chart-a)" />
        </section>
        <section className="panel">
          <h3 style={{ marginBottom: 10 }}>{t("auto.page.player_rating_distribution")}</h3>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 8px" }}>
            {t("auto.page.average_hltv_style_rating_of_e")}
                                </p>
          <Histogram buckets={ratingBuckets} color="var(--chart-a)" />
        </section>
      </div>

      {/* ---------- Map stats ---------- */}
      <div className="chart-grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3 style={{ marginBottom: 12 }}>{t("auto.page.most_played_maps")}</h3>
          <HBars rows={mapShare} color="var(--chart-a)" formatValue={v => `${v.toLocaleString()} rds`} />
        </section>
        <section className="panel">
          <h3 style={{ marginBottom: 12 }}>{t("auto.page.side_balance_per_map")}</h3>
          <SideSplitBars rows={mapBalance} t={t} />
          {mapBalance.length === 0 && <p className="muted">{t("auto.page.not_enough_rounds_per_map_yet")}</p>}
        </section>
      </div>

      {/* ---------- Leaderboards ---------- */}
      <section className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 4 }}>{t("auto.page.season_leaders")}</h3>
        <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 14px" }}>
          {t("auto.page.minimum_10_ranked_rounds_to_qu")}
                          </p>
        <LeaderboardTabs
          boards={boards.map(b => ({
            title: b.title,
            unit: b.unit,
            rows: b.rows.map(r => ({
              steamId: r.steamId,
              name: nameFrom(names, r.steamId),
              value: b.format(r.value),
            })),
          }))}
        />
      </section>
    </>
  );
}
