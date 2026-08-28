/**
 * What a forced result does to the numbers.
 *
 * An admin ending a match by hand is not the same as a match that stopped
 * being played. It is a RESULT: the map goes to somebody, the bracket moves,
 * and the scoreline has to look like a map that finished rather than one that
 * was abandoned at 4-3. A forfeit at 4-3 tells everybody who reads the bracket
 * later that the map was never completed, which is the opposite of what
 * awarding it means.
 *
 * Import-free and on its own, because every one of these rules is decidable
 * from numbers alone and the interesting cases — a winner already past 13, a
 * winner who is BEHIND, a series that was already 1-0 the other way — are the
 * ones nobody reaches by hand on a live server.
 */

/** Which team, in the vocabulary the match page and the bracket both use. */
export type Slot = "a" | "b";

/** Rounds that take a map in regulation. Matches the plugin's MR12. */
export const MAP_WIN_ROUNDS = 13;

export type Scoreline = { a: number; b: number };

/**
 * The scoreline a forced map win produces.
 *
 * The winner is put on the number that takes a map and the loser keeps exactly
 * what they earned — "13 and whatever you had" is the standard forfeit line and
 * it reads correctly everywhere a score is shown.
 *
 * Two guards that only matter in overtime and only ever bite once:
 *
 *   - a winner already ABOVE 13 (say 15 in the first overtime) is not moved
 *     down to 13; the score they earned already beats the award.
 *   - a loser on 13 or more would produce 13-13, which is not a win at all. The
 *     award has to clear them, so it becomes loser+1. This is the case that
 *     turns a forced win into a drawn map if you write only the first rule.
 */
export function forcedMapScore(current: Scoreline, winner: Slot): Scoreline {
  const mine = winner === "a" ? current.a : current.b;
  const theirs = winner === "a" ? current.b : current.a;

  const awarded = Math.max(MAP_WIN_ROUNDS, mine, theirs + 1);

  return winner === "a" ? { a: awarded, b: theirs } : { a: theirs, b: awarded };
}

/**
 * Maps needed to take a best-of.
 *
 * `Math.floor(n / 2) + 1` — 1 of 1, 2 of 3, 3 of 5. Written here as well as in
 * matchRunner because the forced series score below is derived from it and the
 * two must not be able to disagree.
 */
export const mapsToWin = (bestOf: number) => Math.floor(bestOf / 2) + 1;

/**
 * The series score a forced match win produces.
 *
 * Normally the recount already has the winner ahead, and this returns it
 * untouched. It only intervenes when the admin's chosen winner does NOT lead
 * the maps — a team awarded the match after losing map one — where leaving the
 * count alone would put "1-0 Cobras" next to "winner: Eagles" on the same
 * bracket line. The award moves the winner to the number that takes the series
 * and leaves the loser's maps, exactly as the map rule does with rounds.
 */
export function forcedSeriesScore(current: Scoreline, winner: Slot, bestOf: number): Scoreline {
  const need = mapsToWin(bestOf);
  const mine = winner === "a" ? current.a : current.b;
  const theirs = winner === "a" ? current.b : current.a;

  if (mine > theirs) return current;

  const awarded = Math.max(need, theirs + 1);

  return winner === "a" ? { a: awarded, b: theirs } : { a: theirs, b: awarded };
}
