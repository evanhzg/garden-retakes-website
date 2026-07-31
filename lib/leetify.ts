/**
 * Performance analysis — category scores, percentiles, trends and coaching.
 *
 * Everything here runs on PlayerRoundRecord, which the CS2 plugin already
 * writes per round. That matters: the five categories below are derived from
 * data the server has today, so this needs no demo pipeline to be useful.
 *
 * What demos would add is listed in DEMO_DERIVED at the bottom — those metrics
 * genuinely cannot be computed from round records and are honestly absent
 * rather than faked from proxies.
 */

export type Round = {
  Map: string;
  PlayedAtUtc: Date;
  TeamNum: number;
  WonRound: boolean;
  Kills: number;
  Headshots: number;
  Assists: number;
  FlashAssists: number;
  Damage: number;
  UtilityDamage: number;
  EnemiesFlashed: number;
  EnemyBlindDuration: number;
  Died: boolean;
  DiedAtSeconds: number | null;
  WasTeamKilled: boolean;
  KilledTeammate: boolean;
  DiedEarly: boolean;
  OpeningKill: boolean;
  OpeningDeath: boolean;
  TradeKills: number;
  TradedDeath: boolean;
  Kast: boolean;
  MultiKillCount: number;
  ClutchVersus: number;
  ClutchWon: boolean;
  BombPlanted: boolean;
  BombDefused: boolean;
  WasAfk: boolean;
  Rating: number;
  EloDelta: number;
};

export const CATEGORIES = ["aim", "utility", "teamplay", "positioning", "trading"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  aim: "Aim",
  utility: "Utility",
  teamplay: "Teamplay",
  positioning: "Positioning",
  trading: "Trading",
};

/** Raw per-round rates. Every downstream number is built from these. */
export type Metrics = {
  rounds: number;
  // aim
  hsPct: number;
  adr: number;
  kpr: number;
  multiKillRate: number;
  openingWinPct: number;
  // utility
  utilDmgPerRound: number;
  flashesPerRound: number;
  blindPerRound: number;
  flashAssistsPerRound: number;
  // teamplay
  kast: number;
  assistsPerRound: number;
  teamKillRate: number;
  // positioning
  survivalPct: number;
  openingDeathRate: number;
  earlyDeathRate: number;
  avgDeathSecond: number;
  // trading
  tradeKillsPerRound: number;
  tradedDeathPct: number;
  // context
  winPct: number;
  rating: number;
  eloDelta: number;
};

const rate = (n: number, d: number) => (d > 0 ? n / d : 0);
const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : 0);

export function metricsOf(rows: Round[]): Metrics {
  // AFK rounds would drag every rate down through no fault of play.
  const rs = rows.filter((r) => !r.WasAfk);
  const n = rs.length;
  const kills = rs.reduce((s, r) => s + r.Kills, 0);
  const deaths = rs.filter((r) => r.Died).length;
  const deathTimes = rs.map((r) => r.DiedAtSeconds).filter((d): d is number => d != null);
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
    avgDeathSecond: deathTimes.length ? deathTimes.reduce((s, d) => s + d, 0) / deathTimes.length : 0,

    tradeKillsPerRound: rate(rs.reduce((s, r) => s + r.TradeKills, 0), n),
    // Of the rounds you died in, how often did a teammate trade you? High is
    // good: it means you die *with* the team rather than alone.
    tradedDeathPct: pct(rs.filter((r) => r.TradedDeath).length, deaths),

    winPct: pct(rs.filter((r) => r.WonRound).length, n),
    rating: n ? rs.reduce((s, r) => s + r.Rating, 0) / n : 0,
    eloDelta: rs.reduce((s, r) => s + r.EloDelta, 0),
  };
}

/**
 * Each category is a weighted blend of its metrics, scored against the
 * population rather than an invented absolute scale — 50 always means "median
 * player on this server", which is the only anchor that stays meaningful as
 * the playerbase changes.
 */
type Weight = { key: keyof Metrics; weight: number; invert?: boolean };

const CATEGORY_WEIGHTS: Record<Category, Weight[]> = {
  aim: [
    { key: "adr", weight: 0.35 },
    { key: "kpr", weight: 0.25 },
    { key: "hsPct", weight: 0.2 },
    { key: "multiKillRate", weight: 0.2 },
  ],
  utility: [
    { key: "utilDmgPerRound", weight: 0.35 },
    { key: "blindPerRound", weight: 0.25 },
    { key: "flashAssistsPerRound", weight: 0.25 },
    { key: "flashesPerRound", weight: 0.15 },
  ],
  teamplay: [
    { key: "kast", weight: 0.4 },
    { key: "assistsPerRound", weight: 0.25 },
    { key: "flashAssistsPerRound", weight: 0.2 },
    { key: "teamKillRate", weight: 0.15, invert: true },
  ],
  positioning: [
    { key: "survivalPct", weight: 0.3 },
    { key: "openingDeathRate", weight: 0.25, invert: true },
    { key: "earlyDeathRate", weight: 0.25, invert: true },
    { key: "avgDeathSecond", weight: 0.2 },
  ],
  trading: [
    { key: "tradeKillsPerRound", weight: 0.45 },
    { key: "tradedDeathPct", weight: 0.35 },
    { key: "openingWinPct", weight: 0.2 },
  ],
};

/** Distribution of one metric across the population, for percentile scoring. */
export type Population = Record<string, number[]>;

export function buildPopulation(all: Metrics[]): Population {
  const pop: Population = {};
  const keys = Object.keys(all[0] ?? {}) as (keyof Metrics)[];
  for (const k of keys) {
    pop[k] = all.map((m) => m[k]).sort((a, b) => a - b);
  }
  return pop;
}

/** Where `value` sits in a sorted sample, 0–100. */
export function percentileOf(sorted: number[], value: number): number {
  if (!sorted || sorted.length === 0) return 50;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return (100 * lo) / sorted.length;
}

export type CategoryScore = {
  category: Category;
  score: number;
  parts: { key: keyof Metrics; label: string; value: number; percentile: number; invert: boolean }[];
};

export const METRIC_LABEL: Partial<Record<keyof Metrics, string>> = {
  hsPct: "Headshot %",
  adr: "ADR",
  kpr: "Kills / round",
  multiKillRate: "Multi-kill rounds",
  openingWinPct: "Opening duel win %",
  utilDmgPerRound: "Utility damage / round",
  flashesPerRound: "Enemies flashed / round",
  blindPerRound: "Blind time / round",
  flashAssistsPerRound: "Flash assists / round",
  kast: "KAST",
  assistsPerRound: "Assists / round",
  teamKillRate: "Team kills",
  survivalPct: "Survival %",
  openingDeathRate: "Opening deaths",
  earlyDeathRate: "Early deaths",
  avgDeathSecond: "Avg. time of death",
  tradeKillsPerRound: "Trade kills / round",
  tradedDeathPct: "Deaths traded %",
};

export function scoreCategories(m: Metrics, pop: Population): CategoryScore[] {
  return CATEGORIES.map((category) => {
    const parts = CATEGORY_WEIGHTS[category].map((w) => {
      const raw = percentileOf(pop[w.key] ?? [], m[w.key]);
      return {
        key: w.key,
        label: METRIC_LABEL[w.key] ?? String(w.key),
        value: m[w.key],
        // Inverted metrics are ones where less is better, so a high percentile
        // is a bad result and has to be flipped before it is averaged in.
        percentile: w.invert ? 100 - raw : raw,
        invert: !!w.invert,
      };
    });
    const total = CATEGORY_WEIGHTS[category].reduce((s, w) => s + w.weight, 0);
    const score = parts.reduce(
      (s, p, i) => s + p.percentile * CATEGORY_WEIGHTS[category][i].weight,
      0,
    ) / total;
    return { category, score, parts };
  });
}

/** Overall score: the five categories, evenly weighted. */
export const overallScore = (scores: CategoryScore[]) =>
  scores.reduce((s, c) => s + c.score, 0) / (scores.length || 1);

/* ── suggestions ───────────────────────────────────────────────────────── */

export type Suggestion = {
  category: Category;
  severity: "critical" | "work-on" | "strength";
  title: string;
  detail: string;
  /** Practice-mode hook: what this player should actually go and drill. */
  drill?: string;
};

/**
 * Coaching is comparative, not absolute: a metric is only worth mentioning if
 * it is out of line with the population *or* with the player's own baseline.
 * "Your ADR is 68" tells someone nothing; "your ADR has dropped 14 below your
 * own average" tells them to look at what changed.
 */
export function buildSuggestions(
  recent: Metrics,
  career: Metrics,
  pop: Population,
  scores: CategoryScore[],
): Suggestion[] {
  const out: Suggestion[] = [];

  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  const DRILLS: Record<Category, string> = {
    aim: "Prefire routes on your worst map, then a 10-minute headshot-only warmup.",
    utility: "Nade Book: run the Execute lineups for your most-played map until each passes 3×.",
    teamplay: "Play with a regular duo and call every rotation out loud for one session.",
    positioning: "Watch your five earliest deaths back; re-run those spots in Practice with bots.",
    trading: "Prefire routes as a pair — stay within trade distance of your entry.",
  };

  // 1. Weakest category always gets a line.
  out.push({
    category: weakest.category,
    severity: weakest.score < 35 ? "critical" : "work-on",
    title: `${CATEGORY_LABEL[weakest.category]} is your weakest area`,
    detail: `You sit in the ${Math.round(weakest.score)}th percentile for ${CATEGORY_LABEL[
      weakest.category
    ].toLowerCase()}. The biggest drag is ${weakest.parts
      .slice()
      .sort((a, b) => a.percentile - b.percentile)[0]
      .label.toLowerCase()}.`,
    drill: DRILLS[weakest.category],
  });

  // 2. Anything that has moved sharply against the player's own baseline.
  const drift: { key: keyof Metrics; label: string; delta: number; better: boolean }[] = [];
  const watch: { key: keyof Metrics; invert?: boolean }[] = [
    { key: "adr" }, { key: "kast" }, { key: "hsPct" },
    { key: "utilDmgPerRound" }, { key: "tradeKillsPerRound" },
    { key: "openingDeathRate", invert: true }, { key: "survivalPct" },
  ];
  for (const w of watch) {
    const base = career[w.key];
    if (!base) continue;
    const change = ((recent[w.key] - base) / Math.abs(base)) * 100;
    if (Math.abs(change) < 12) continue;
    drift.push({
      key: w.key,
      label: METRIC_LABEL[w.key] ?? String(w.key),
      delta: change,
      better: w.invert ? change < 0 : change > 0,
    });
  }
  drift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  for (const d of drift.slice(0, 3)) {
    out.push({
      category: categoryOf(d.key),
      severity: d.better ? "strength" : "work-on",
      title: `${d.label} is ${d.better ? "up" : "down"} ${Math.abs(Math.round(d.delta))}% on your average`,
      detail: d.better
        ? `Recent form is ahead of your baseline here — whatever changed, keep it.`
        : `Recent rounds are below your own baseline, so this is form rather than skill. Worth reviewing what changed.`,
      drill: d.better ? undefined : DRILLS[categoryOf(d.key)],
    });
  }

  // 3. One genuine strength, so the report is not only bad news.
  out.push({
    category: strongest.category,
    severity: "strength",
    title: `${CATEGORY_LABEL[strongest.category]} is carrying you`,
    detail: `${Math.round(strongest.score)}th percentile. Lean on it: build rounds around what you already do well.`,
  });

  return out;
}

function categoryOf(key: keyof Metrics): Category {
  for (const c of CATEGORIES) {
    if (CATEGORY_WEIGHTS[c].some((w) => w.key === key)) return c;
  }
  return "aim";
}

/* ── analysis tools ────────────────────────────────────────────────────── */

export type Split = { label: string; metrics: Metrics; rounds: number };

/** Per-map profile, most played first. */
export function byMap(rows: Round[], min = 20): Split[] {
  return group(rows, (r) => r.Map)
    .filter(([, rs]) => rs.length >= min)
    .map(([label, rs]) => ({ label: label.replace(/^de_/, ""), metrics: metricsOf(rs), rounds: rs.length }))
    .sort((a, b) => b.rounds - a.rounds);
}

/** T vs CT. TeamNum 2 is T, 3 is CT. */
export function bySide(rows: Round[]): Split[] {
  return group(rows, (r) => (r.TeamNum === 2 ? "T" : "CT"))
    .map(([label, rs]) => ({ label, metrics: metricsOf(rs), rounds: rs.length }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Clutch record broken out by how many opponents were left. */
export function clutchBreakdown(rows: Round[]) {
  const out: { versus: number; attempts: number; won: number; pct: number }[] = [];
  for (let v = 1; v <= 5; v++) {
    const attempts = rows.filter((r) => r.ClutchVersus === v).length;
    const won = rows.filter((r) => r.ClutchVersus === v && r.ClutchWon).length;
    out.push({ versus: v, attempts, won, pct: pct(won, attempts) });
  }
  return out;
}

/** When in the round you tend to die. */
export function deathTiming(rows: Round[]) {
  const times = rows.map((r) => r.DiedAtSeconds).filter((d): d is number => d != null);
  const buckets = [
    { label: "0–15s", lo: 0, hi: 15 },
    { label: "15–30s", lo: 15, hi: 30 },
    { label: "30–45s", lo: 30, hi: 45 },
    { label: "45–60s", lo: 45, hi: 60 },
    { label: "60s+", lo: 60, hi: Infinity },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: times.filter((t) => t >= b.lo && t < b.hi).length,
    hint: `deaths between ${b.label}`,
  }));
}

/** Rolling rating over recent sessions — the form line. */
export function formTrend(rows: Round[], buckets = 12) {
  const days = group(rows, (r) => r.PlayedAtUtc.toISOString().slice(0, 10))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-buckets);
  return days.map(([label, rs]) => ({
    label: label.slice(5),
    value: metricsOf(rs).rating,
    hint: `${rs.length} rounds`,
  }));
}

/** How steady the player is: lower spread means fewer no-show rounds. */
export function consistency(rows: Round[]) {
  const rs = rows.filter((r) => !r.WasAfk).map((r) => r.Rating);
  if (rs.length < 2) return { mean: 0, stdDev: 0, steadiness: 50 };
  const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
  const variance = rs.reduce((s, v) => s + (v - mean) ** 2, 0) / rs.length;
  const stdDev = Math.sqrt(variance);
  // 0.8 spread is about as swingy as it gets round to round.
  return { mean, stdDev, steadiness: Math.max(0, Math.min(100, 100 - (stdDev / 0.8) * 100)) };
}

/** Multi-kill distribution. */
export function multiKills(rows: Round[]) {
  return [2, 3, 4, 5].map((k) => ({
    label: `${k}K`,
    count: rows.filter((r) => r.MultiKillCount === k).length,
  }));
}

/** Opening duels, split by side — entry fragging is side-dependent. */
export function openingDuels(rows: Round[]) {
  const forSide = (side: "T" | "CT") => {
    const rs = rows.filter((r) => (r.TeamNum === 2 ? "T" : "CT") === side);
    const wins = rs.filter((r) => r.OpeningKill).length;
    const losses = rs.filter((r) => r.OpeningDeath).length;
    return { side, wins, losses, attempts: wins + losses, pct: pct(wins, wins + losses) };
  };
  return [forSide("T"), forSide("CT")];
}

/** Impact of the player's rounds on their ELO, by map. */
export function eloByMap(rows: Round[], min = 20) {
  return group(rows, (r) => r.Map)
    .filter(([, rs]) => rs.length >= min)
    .map(([label, rs]) => ({
      label: label.replace(/^de_/, ""),
      value: rs.reduce((s, r) => s + r.EloDelta, 0),
      hint: `${rs.length} rounds`,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Best and worst time of day, for people who suspect they tilt late. */
export function byHour(rows: Round[], min = 15) {
  return group(rows, (r) => String(r.PlayedAtUtc.getUTCHours()).padStart(2, "0"))
    .filter(([, rs]) => rs.length >= min)
    .map(([label, rs]) => ({ label: `${label}:00`, value: metricsOf(rs).rating, hint: `${rs.length} rounds` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Win rate when the player plants/defuses vs when they do not. */
export function objectiveImpact(rows: Round[]) {
  const withObj = rows.filter((r) => r.BombPlanted || r.BombDefused);
  const without = rows.filter((r) => !r.BombPlanted && !r.BombDefused);
  return {
    withObj: { rounds: withObj.length, winPct: pct(withObj.filter((r) => r.WonRound).length, withObj.length) },
    without: { rounds: without.length, winPct: pct(without.filter((r) => r.WonRound).length, without.length) },
  };
}

function group<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const b = m.get(k);
    if (b) b.push(r);
    else m.set(k, [r]);
  }
  return Array.from(m.entries());
}

/**
 * Metrics that genuinely require demo parsing and are therefore *not* estimated
 * here. Listed so the UI can say what is missing rather than implying the
 * analysis is complete.
 */
export const DEMO_DERIVED = [
  "Crosshair placement height and pre-aim accuracy",
  "Spray control and recoil deviation per weapon",
  "Reaction time from enemy-visible to first shot",
  "Utility landing coordinates vs. the ideal lineup",
  "Movement and positioning heatmaps per map",
  "Counter-strafe accuracy while shooting",
] as const;
