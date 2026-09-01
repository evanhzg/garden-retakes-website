/**
 * Which matches belong to which session.
 *
 * A "session" on the form page is a run of ranked ROUNDS grouped by time —
 * PlayerRoundRecord has no match identity on it at all, so a session cannot
 * carry a match id and the rows had nothing to link to. What it does have is
 * a window, and a tournament match has a clock; a match that started inside
 * the window is a match played during that session.
 *
 * That is a join on time, which is exactly the kind of thing worth pinning
 * down: an off-by-one on the boundary silently attaches a match to the wrong
 * evening. No imports — see tools/tests/sessionmatches.test.mts.
 */

export type SessionWindow = {
  /** ISO. */
  startedAt: string;
  /** ISO. */
  endedAt: string;
};

export type LinkableMatch = {
  /** Epoch ms; a match with no start cannot be placed. */
  startedAt: number | null;
  slug: string;
  id: number;
  map: string | null;
};

/**
 * The matches that started inside a session, oldest first.
 *
 * Inclusive at both ends. A session's window is derived FROM the rounds
 * played, so a match that started on the same millisecond as the first round
 * is that match — a half-open range would drop the first match of every
 * session, which is the one most likely to be looked for.
 *
 * The grace is for the other end: the last round of a match is recorded a
 * moment before the match row is closed, so a match that started seconds
 * after the final round of a session still belongs to it. Two minutes is
 * longer than that gap and shorter than the break between sessions, which
 * the grouping already uses.
 */
export const SESSION_GRACE_MS = 120_000;

export function matchesInSession(
  session: SessionWindow,
  matches: LinkableMatch[],
): LinkableMatch[] {
  const from = Date.parse(session.startedAt);
  const to = Date.parse(session.endedAt);

  // An unparseable window matches nothing rather than everything: NaN
  // comparisons are all false, and "all false" is the safe direction here.
  if (Number.isNaN(from) || Number.isNaN(to)) return [];

  return matches
    .filter((m) => m.startedAt !== null)
    .filter((m) => m.startedAt! >= from - SESSION_GRACE_MS && m.startedAt! <= to + SESSION_GRACE_MS)
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

/** The whole span the sessions cover, for one query instead of one per row. */
export function spanOf(sessions: SessionWindow[]): { from: Date; to: Date } | null {
  const starts = sessions.map((s) => Date.parse(s.startedAt)).filter((n) => !Number.isNaN(n));
  const ends = sessions.map((s) => Date.parse(s.endedAt)).filter((n) => !Number.isNaN(n));
  if (starts.length === 0 || ends.length === 0) return null;
  return {
    from: new Date(Math.min.apply(null, starts) - SESSION_GRACE_MS),
    to: new Date(Math.max.apply(null, ends) + SESSION_GRACE_MS),
  };
}
