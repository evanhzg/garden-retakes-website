import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { summarize, dayKey, formatDate } from "@/lib/stats";
import { resolveNames, nameFrom, NameMap } from "@/lib/names";
import AvatarImage from "@/components/AvatarImage";
import { Columns, HBars, SideSplitBars, Histogram } from "@/components/stats/charts";

export const dynamic = "force-dynamic";
export const revalidate = 60;

function Leaderboard({
  title,
  rows,
  names,
  format,
}: {
  title: string;
  rows: { steamId: string; value: number }[];
  names: NameMap;
  format: (v: number) => string;
}) {
  return (
    <div className="side-card">
      <h3>{title}</h3>
      <table className="ladder-table">
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.steamId}>
              <td className="rank-cell">{i + 1}</td>
              <td>
                <Link href={`/players/${p.steamId}`} className="ladder-player">
                  <span className="ladder-avatar"><AvatarImage steamId={p.steamId} /></span>
                  <span>{nameFrom(names, p.steamId)}</span>
                </Link>
              </td>
              <td style={{ fontWeight: 800 }}>{format(p.value)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="muted" colSpan={3}>Not enough data yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default async function StatsPage() {
  const season = await getActiveSeason();
  if (!season) {
    return (
      <section className="panel">
        <h2>Global Stats</h2>
        <p className="muted">No active season found.</p>
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

  const boards: { title: string; rows: { steamId: string; value: number }[]; format: (v: number) => string }[] = [
    { title: "Highest ADR", rows: top(s => s.adr), format: v => v.toFixed(0) },
    { title: "Most Clutches", rows: top(s => s.clutches), format: v => String(v) },
    {
      title: "Best Entry (OK %)",
      rows: top(
        s => (100 * s.openingKills) / Math.max(1, s.openingKills + s.openingDeaths),
        s => s.openingKills + s.openingDeaths >= 5
      ),
      format: v => `${v.toFixed(1)}%`,
    },
    { title: "Highest KAST", rows: top(s => s.kast), format: v => `${v.toFixed(1)}%` },
    { title: "Headshot %", rows: top(s => s.hs, s => s.kills >= 50), format: v => `${v.toFixed(1)}%` },
    { title: "Util Dmg / Round", rows: top(s => s.utilPerRound), format: v => v.toFixed(1) },
    { title: "Trade Kills", rows: top(s => s.tradeKills), format: v => String(v) },
    { title: "Bomb Plants + Defuses", rows: top(s => s.plants + s.defuses), format: v => String(v) },
    { title: "Multi-kill Rounds", rows: top(s => s.multiKills), format: v => String(v) },
    { title: "Most Rounds Played", rows: top(s => s.rounds), format: v => String(v) },
  ];

  const idsToResolve = Array.from(new Set(boards.flatMap(b => b.rows.map(r => BigInt(r.steamId)))));
  const names = await resolveNames(idsToResolve);

  return (
    <>
      {/* ---------- Season totals ---------- */}
      <section className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 14 }}>{season.Name} — server totals (ranked)</h3>
        <div className="stat-tiles">
          <div className="stat-tile accent"><strong>{totals.rounds.toLocaleString()}</strong><span>Rounds</span></div>
          <div className="stat-tile"><strong>{totals.players}</strong><span>Players</span></div>
          <div className="stat-tile"><strong>{totals.kills.toLocaleString()}</strong><span>Kills</span></div>
          <div className="stat-tile"><strong>{Math.round(totals.damage / 1000).toLocaleString()}k</strong><span>Damage</span></div>
          <div className="stat-tile"><strong>{totals.clutches}</strong><span>Clutches</span></div>
          <div className="stat-tile"><strong>{totals.plants}</strong><span>Plants</span></div>
          <div className="stat-tile"><strong>{totals.defuses}</strong><span>Defuses</span></div>
          <div className="stat-tile accent"><strong>{totals.aces}</strong><span>4k+ Rounds</span></div>
        </div>
      </section>

      {/* ---------- Activity + rating distribution ---------- */}
      <div className="chart-grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3 style={{ marginBottom: 10 }}>Rounds per day — last 14 days</h3>
          <Columns data={activity} color="var(--chart-a)" />
        </section>
        <section className="panel">
          <h3 style={{ marginBottom: 10 }}>Player rating distribution</h3>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 8px" }}>
            Average HLTV-style rating of every player with 10+ ranked rounds.
          </p>
          <Histogram buckets={ratingBuckets} color="var(--chart-a)" />
        </section>
      </div>

      {/* ---------- Map stats ---------- */}
      <div className="chart-grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3 style={{ marginBottom: 12 }}>Most played maps</h3>
          <HBars rows={mapShare} color="var(--chart-a)" formatValue={v => `${v.toLocaleString()} rds`} />
        </section>
        <section className="panel">
          <h3 style={{ marginBottom: 12 }}>Side balance per map</h3>
          <SideSplitBars rows={mapBalance} />
          {mapBalance.length === 0 && <p className="muted">Not enough rounds per map yet.</p>}
        </section>
      </div>

      {/* ---------- Leaderboards ---------- */}
      <section className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 4 }}>Season leaders</h3>
        <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>Minimum 10 ranked rounds to qualify.</p>
      </section>
      <div className="split-cards" style={{ marginTop: 12 }}>
        {boards.map(b => (
          <Leaderboard key={b.title} title={b.title} rows={b.rows} names={names} format={b.format} />
        ))}
      </div>
    </>
  );
}
