/**
 * Who gets a card at the top of the stats page, and how the tournaments below
 * it are grouped.
 *
 * No imports on purpose. Everything here is decidable from the values it is
 * handed — which player is the MVP, which calendar month "last month" is,
 * which tournaments are still running — so it is testable without a database
 * and without a browser. See tools/tests/honours.test.mts.
 */

/** The part of a stat line these decisions actually read. */
export type Contender = {
  steamId: string;
  name: string;
  ratingAvg: number;
  roundsPlayed: number;
  kills: number;
  damage: number;
};

/**
 * The floor for an honour.
 *
 * A leaderboard with a low floor is a list of whoever played two rounds and
 * got a lucky ace; an MVP card with no floor is worse, because it puts that
 * player's face at the top of the page. Higher than the board minimum for
 * exactly that reason.
 */
export const MVP_MIN_ROUNDS = 24;

/** The same floor, relaxed, for a single month — a month is not a career. */
export const MONTH_MIN_ROUNDS = 12;

/**
 * Best of the lot, or null if nobody clears the floor.
 *
 * Rating first, then rounds, then kills, then the id. Every tie-break is
 * needed: two players on a 1.00 rating over the same handful of rounds is the
 * normal case early in a tournament's life, and a comparator that can return 0
 * leaves the winner to sort stability — which is to say, to the order the
 * database happened to return.
 */
export function pickMvp(players: Contender[], minRounds = MVP_MIN_ROUNDS): Contender | null {
  const eligible = players.filter((p) => p.roundsPlayed >= minRounds);
  if (eligible.length === 0) return null;

  return eligible.slice().sort(compareContenders)[0];
}

/** Rating, rounds, kills, id — descending, except the id which breaks ties. */
export function compareContenders(a: Contender, b: Contender): number {
  if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
  if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;
  if (b.kills !== a.kills) return b.kills - a.kills;
  return a.steamId < b.steamId ? -1 : a.steamId > b.steamId ? 1 : 0;
}

/**
 * The month that just ended, as a half-open range [start, end).
 *
 * "Player of the month" is about a month that is over. Using the current one
 * means the card changes every time somebody plays and crowns nobody until the
 * 31st, and on the 1st it is empty. So this is always the PREVIOUS calendar
 * month, in UTC — the same clock every timestamp in the database is written
 * in, so a match at 00:30 CET on the 1st does not land in the wrong month.
 */
export function lastMonthWindow(now: Date): { start: Date; end: Date; year: number; month: number } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { start, end, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 };
}

/** Whether a timestamp falls inside a window. Half-open: start included, end not. */
export function inWindow(at: Date | null | undefined, w: { start: Date; end: Date }): boolean {
  if (!at) return false;
  const ms = at.getTime();
  return ms >= w.start.getTime() && ms < w.end.getTime();
}

export type TournamentLike = {
  id: number;
  slug: string;
  name: string;
  /** draft | registration | live | finished | cancelled */
  state: string;
  startsAt: Date | null;
  /** When its last match ended, or null if none have. */
  endedAt: Date | null;
};

/**
 * Two groups: what is happening, and what has happened.
 *
 * `current` is anything open — running, or open for registration, in that
 * order, because a bracket in progress is more interesting than one that has
 * not started. `past` is finished, newest first.
 *
 * Draft and cancelled appear in neither. A draft is not public and a cancelled
 * tournament has nothing to show; putting either in the archive would make the
 * archive a list of things that did not happen.
 */
export function splitTournaments(list: TournamentLike[]): {
  current: TournamentLike[];
  past: TournamentLike[];
} {
  const rank = (t: TournamentLike) => (t.state === "live" ? 0 : 1);
  const time = (d: Date | null) => (d ? d.getTime() : 0);

  const current = list
    .filter((t) => t.state === "live" || t.state === "registration")
    .slice()
    .sort((a, b) => rank(a) - rank(b) || time(a.startsAt) - time(b.startsAt));

  const past = list
    .filter((t) => t.state === "finished")
    .slice()
    .sort((a, b) => time(b.endedAt) - time(a.endedAt) || time(b.startsAt) - time(a.startsAt));

  return { current, past };
}

/**
 * The three lines under an MVP's name.
 *
 * Chosen rather than "every number we have": a card that lists nine stats is a
 * table with a photograph. Rating is why they are on the card, ADR is the one
 * number that says how they got there, and rounds is the answer to "over how
 * much?" — which is the first thing anybody asks of a rating.
 */
export function mvpLine(p: Contender): { rating: string; adr: string; rounds: string } {
  return {
    rating: p.ratingAvg.toFixed(2),
    adr: (p.damage / Math.max(1, p.roundsPlayed)).toFixed(0),
    rounds: String(p.roundsPlayed),
  };
}
