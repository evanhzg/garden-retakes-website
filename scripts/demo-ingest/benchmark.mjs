/**
 * Turns parsed demo rows into the benchmark the website compares against.
 *
 * What ships is a *distribution*, not the demos: for each skill band and each
 * metric we keep a sorted percentile ladder. That is all /insights needs to say
 * "you are 68th percentile for ADR against FACEIT 7-8", and it keeps the
 * artefact in the tens of kilobytes instead of gigabytes of .dem.
 */

import fs from "fs";
import path from "path";

/** Percentile points kept per metric. 21 points = every 5th percentile. */
const LADDER = Array.from({ length: 21 }, (_, i) => i * 5);

/** Metric keys mirror lib/leetify.ts Metrics so both sides speak one language. */
export const METRIC_KEYS = [
  "hsPct", "adr", "kpr", "multiKillRate", "openingWinPct",
  "utilDmgPerRound", "flashesPerRound", "blindPerRound", "flashAssistsPerRound",
  "kast", "assistsPerRound", "teamKillRate",
  "survivalPct", "openingDeathRate", "earlyDeathRate", "avgDeathSecond",
  "tradeKillsPerRound", "tradedDeathPct",
  "winPct", "rating",
];

const rate = (n, d) => (d > 0 ? n / d : 0);
const pct = (n, d) => (d > 0 ? (100 * n) / d : 0);

/** Same computation as lib/leetify.ts metricsOf, over demo-derived rows. */
export function metricsOfRows(rs) {
  const n = rs.length;
  if (n === 0) return null;
  const kills = rs.reduce((s, r) => s + r.Kills, 0);
  const deaths = rs.filter((r) => r.Died).length;
  const times = rs.map((r) => r.DiedAtSeconds).filter((d) => d != null);
  const entries = rs.filter((r) => r.OpeningKill || r.OpeningDeath).length;

  return {
    rounds: n,
    hsPct: pct(rs.reduce((s, r) => s + r.Headshots, 0), kills),
    adr: rate(rs.reduce((s, r) => s + r.Damage, 0), n),
    kpr: rate(kills, n),
    multiKillRate: pct(rs.filter((r) => r.MultiKillCount >= 2).length, n),
    openingWinPct: pct(rs.filter((r) => r.OpeningKill).length, entries),
    utilDmgPerRound: rate(rs.reduce((s, r) => s + r.UtilityDamage, 0), n),
    flashesPerRound: rate(rs.reduce((s, r) => s + r.EnemiesFlashed, 0), n),
    blindPerRound: rate(rs.reduce((s, r) => s + r.EnemyBlindDuration, 0), n),
    flashAssistsPerRound: rate(rs.reduce((s, r) => s + r.FlashAssists, 0), n),
    kast: pct(rs.filter((r) => r.Kast).length, n),
    assistsPerRound: rate(rs.reduce((s, r) => s + r.Assists, 0), n),
    teamKillRate: pct(rs.filter((r) => r.KilledTeammate).length, n),
    survivalPct: pct(n - deaths, n),
    openingDeathRate: pct(rs.filter((r) => r.OpeningDeath).length, n),
    earlyDeathRate: pct(rs.filter((r) => r.DiedEarly).length, n),
    avgDeathSecond: times.length ? times.reduce((s, d) => s + d, 0) / times.length : 0,
    tradeKillsPerRound: rate(rs.reduce((s, r) => s + r.TradeKills, 0), n),
    tradedDeathPct: pct(rs.filter((r) => r.TradedDeath).length, deaths),
    winPct: pct(rs.filter((r) => r.WonRound).length, n),
    rating: 0,
  };
}

function ladderOf(values) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  return LADDER.map((p) => {
    const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
    return Math.round(s[i] * 100) / 100;
  });
}

/**
 * @param perPlayer Array of { band, metrics } — one entry per player per match,
 *   since a player's performance in one game is the unit being distributed.
 */
export function buildBenchmark(perPlayer, { minSamples = 20 } = {}) {
  const byBand = new Map();
  for (const e of perPlayer) {
    if (!e?.metrics) continue;
    if (!byBand.has(e.band)) byBand.set(e.band, []);
    byBand.get(e.band).push(e.metrics);
  }

  const bands = {};
  for (const [band, list] of byBand) {
    if (list.length < minSamples) continue;
    const ladders = {};
    for (const k of METRIC_KEYS) {
      const l = ladderOf(list.map((m) => m[k]));
      if (l) ladders[k] = l;
    }
    bands[band] = { samples: list.length, percentiles: ladders };
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    ladder: LADDER,
    bands,
  };
}

/**
 * Grenade landing clusters, for judging whether a throw "worked".
 *
 * Grouped on a coarse grid by map + type + landing cell. A throw that lands in
 * a dense cell is one a lot of good players also make; a throw in an empty cell
 * is either creative or wrong, and the count is what tells them apart.
 */
export function buildNadeClusters(grenades, { cell = 96, minCount = 3 } = {}) {
  const buckets = new Map();
  for (const g of grenades) {
    if (!g?.map || g.x == null) continue;
    const key = [g.map, g.type, Math.round(g.x / cell), Math.round(g.y / cell), Math.round(g.z / cell)].join("|");
    const b = buckets.get(key);
    if (b) b.count += 1;
    else buckets.set(key, { map: g.map, type: g.type, x: g.x, y: g.y, z: g.z, count: 1 });
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    cell,
    clusters: Array.from(buckets.values())
      .filter((b) => b.count >= minCount)
      .sort((a, b) => b.count - a.count),
  };
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
