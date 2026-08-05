import { prisma } from "@/lib/db";

/**
 * "Your last ten games", for a server that does not play games.
 *
 * Faceit can show a last-20-matches strip because a match is a thing with a
 * start, an end and a scoreline. Retakes has none of that: the server runs
 * continuously and a player joins and leaves whenever. The only row we store is
 * one per round, so a "game" has to be derived.
 *
 * A session is a run of that player's rounds with no gap longer than
 * SESSION_GAP_MS. That is what a game actually is here — you sat down, played
 * for a while, and left — and it is stable in a way that "the last N rounds" is
 * not: twenty rounds might be one evening or three weeks.
 *
 * Sessions are per player, deliberately. Two people on the same server produce
 * different sessions if one of them joined late, and pretending otherwise would
 * put rounds in someone's history that they were not there for.
 */

/** A break of half an hour ends a session. Long enough to survive a map change
 *  and a smoke break, short enough that tomorrow evening is a new session. */
const SESSION_GAP_MS = 30 * 60_000;

/** How many rounds back to look. A cap, not a target — it bounds the query. */
const MAX_ROUNDS = 1200;

export type SessionSummary = {
  startedAt: string;
  endedAt: string;
  maps: string[];
  rounds: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  damage: number;
  rating: number;
  /** Did the player win more rounds than they lost? Drives the W/L strip. */
  won: boolean;
};

export type RecentForm = {
  steamId: string;
  /** Rounds behind the aggregate, so a thin sample can be shown as thin. */
  rounds: number;
  sessions: SessionSummary[];
  kd: number;
  adr: number;
  hsPercent: number;
  kastPercent: number;
  winPercent: number;
  rating: number;
  openingWinPercent: number;
  multiKills: number;
  clutches: number;
  /** Most-played map across the window, for a one-line "plays Mirage" note. */
  topMap: string | null;
};

type Row = {
  Map: string;
  PlayedAtUtc: Date;
  WonRound: boolean;
  Kills: number;
  Headshots: number;
  Damage: number;
  Died: boolean;
  Kast: boolean;
  OpeningKill: boolean;
  OpeningDeath: boolean;
  MultiKillCount: number;
  ClutchWon: boolean;
  Rating: number;
};

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Split rounds (newest first) into sessions, newest session first. */
function toSessions(rows: Row[]): Row[][] {
  const out: Row[][] = [];
  let current: Row[] = [];
  let previous: number | null = null;

  for (const r of rows) {
    const at = r.PlayedAtUtc.getTime();
    if (previous !== null && previous - at > SESSION_GAP_MS) {
      out.push(current);
      current = [];
    }
    current.push(r);
    previous = at;
  }
  if (current.length) out.push(current);
  return out;
}

function summariseSession(rows: Row[]): SessionSummary {
  const wins = rows.filter((r) => r.WonRound).length;
  const deaths = rows.filter((r) => r.Died).length;
  const kills = rows.reduce((n, r) => n + r.Kills, 0);
  const damage = rows.reduce((n, r) => n + r.Damage, 0);
  const rating = rows.reduce((n, r) => n + r.Rating, 0) / rows.length;

  const mapCounts = new Map<string, number>();
  for (const r of rows) mapCounts.set(r.Map, (mapCounts.get(r.Map) ?? 0) + 1);

  // rows arrive newest-first, so the session's start is the last of them.
  return {
    startedAt: rows[rows.length - 1].PlayedAtUtc.toISOString(),
    endedAt: rows[0].PlayedAtUtc.toISOString(),
    maps: Array.from(mapCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m),
    rounds: rows.length,
    wins,
    losses: rows.length - wins,
    kills,
    deaths,
    damage,
    rating: round2(rating),
    won: wins > rows.length - wins,
  };
}

/**
 * Recent form for one player.
 *
 * `sessionLimit` is what the caller means by "last N games". The aggregate is
 * computed over exactly those sessions rather than over the whole query window,
 * so the headline numbers and the W/L strip describe the same games.
 */
export async function recentForm(
  steamId: bigint,
  sessionLimit = 10,
  rankedOnly = true
): Promise<RecentForm> {
  const rows = (await prisma.playerRoundRecord.findMany({
    where: { SteamId: steamId, ...(rankedOnly ? { IsRanked: true } : {}) },
    select: {
      Map: true,
      PlayedAtUtc: true,
      WonRound: true,
      Kills: true,
      Headshots: true,
      Damage: true,
      Died: true,
      Kast: true,
      OpeningKill: true,
      OpeningDeath: true,
      MultiKillCount: true,
      ClutchWon: true,
      Rating: true,
    },
    orderBy: { PlayedAtUtc: "desc" },
    take: MAX_ROUNDS,
  })) as Row[];

  const empty: RecentForm = {
    steamId: steamId.toString(),
    rounds: 0,
    sessions: [],
    kd: 0,
    adr: 0,
    hsPercent: 0,
    kastPercent: 0,
    winPercent: 0,
    rating: 0,
    openingWinPercent: 0,
    multiKills: 0,
    clutches: 0,
    topMap: null,
  };
  if (rows.length === 0) return empty;

  const sessions = toSessions(rows).slice(0, sessionLimit);
  const scoped = sessions.flat();
  if (scoped.length === 0) return empty;

  const kills = scoped.reduce((n, r) => n + r.Kills, 0);
  const deaths = scoped.filter((r) => r.Died).length;
  const headshots = scoped.reduce((n, r) => n + r.Headshots, 0);
  const damage = scoped.reduce((n, r) => n + r.Damage, 0);
  const openings = scoped.filter((r) => r.OpeningKill || r.OpeningDeath).length;

  const mapCounts = new Map<string, number>();
  for (const r of scoped) mapCounts.set(r.Map, (mapCounts.get(r.Map) ?? 0) + 1);

  return {
    steamId: steamId.toString(),
    rounds: scoped.length,
    sessions: sessions.map(summariseSession),
    // Deaths, not rounds: a round you survived is not a death, and dividing by
    // rounds would flatter everyone who plays passively.
    kd: round2(deaths > 0 ? kills / deaths : kills),
    adr: round1(damage / scoped.length),
    hsPercent: round1(pct(headshots, kills)),
    kastPercent: round1(pct(scoped.filter((r) => r.Kast).length, scoped.length)),
    winPercent: round1(pct(scoped.filter((r) => r.WonRound).length, scoped.length)),
    rating: round2(scoped.reduce((n, r) => n + r.Rating, 0) / scoped.length),
    openingWinPercent: round1(pct(scoped.filter((r) => r.OpeningKill).length, openings)),
    multiKills: scoped.filter((r) => r.MultiKillCount >= 3).length,
    clutches: scoped.filter((r) => r.ClutchWon).length,
    topMap: Array.from(mapCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

/** Several players at once, for a lobby roster. */
export async function recentFormFor(
  steamIds: bigint[],
  sessionLimit = 10
): Promise<Record<string, RecentForm>> {
  const results = await Promise.all(steamIds.map((id) => recentForm(id, sessionLimit)));
  return Object.fromEntries(results.map((r) => [r.steamId, r]));
}
