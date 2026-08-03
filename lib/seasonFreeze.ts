/**
 * The season freeze, in one place.
 *
 * While the season-end vote is open the season is over and ELO is frozen, so
 * ranked and competitive retakes are not something the server can honestly run:
 * the points they exist to award would go nowhere. Three surfaces have to say so
 * — the admin panel's game-mode control, the admin dashboard, and the homepage
 * ballot — and they have to agree on the answer to "when do they come back",
 * which is the poll's closing time and nothing else.
 *
 * Deliberately free of imports. lib/db and lib/rcon are `server-only` and every
 * caller of this is a client component, so pulling the poll shape out of a
 * server module would drag the whole server chain into the browser bundle — the
 * same trap lib/gameModes.ts documents.
 */

/** Just enough of the poll for the freeze; the shape /api/vote already returns. */
export type FreezePoll = { closesAt: string; open: boolean } | null | undefined;

/**
 * ELO is frozen for exactly as long as the vote is running. Not "a poll exists"
 * — a closed poll is last season's result, and gating on that would leave ranked
 * unavailable for the eleven months the results stay on the page.
 */
export const isFrozen = (poll: FreezePoll): boolean => Boolean(poll?.open);

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The closing time, written the way the reader's own language writes times.
 *
 * An ISO string is the truth but it is not readable, and `toLocaleString()` with
 * no arguments follows the browser rather than the language the site is being
 * read in — which is how a French page ends up printing an American date.
 */
export function freezeDate(iso: string, locale: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * How long is left, in the largest two units that still say something.
 *
 * A date alone answers "when" but not "how long do I wait", and those are
 * different questions to an admin deciding whether to close the vote early. The
 * unit pair drops as the deadline approaches — days and hours become hours and
 * minutes become minutes — because "2d 0h" is precision nobody asked for and
 * "0d 0h 7m" buries the only number that matters.
 */
export function freezeLeft(iso: string, t: Translate, now: number = Date.now()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const ms = at.getTime() - now;
  if (ms <= 0) return t("season.freeze.left_now");

  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);

  if (days > 0) return t("season.freeze.left_days", { d: days, h: hours });
  if (hours > 0) return t("season.freeze.left_hours", { h: hours, m: minutes % 60 });
  return t("season.freeze.left_minutes", { m: minutes });
}
