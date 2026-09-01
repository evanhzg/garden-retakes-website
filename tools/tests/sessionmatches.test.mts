/**
 * Attaching matches to a session by time.
 *
 * The failure this catches is quiet: an off-by-one at a boundary puts a match
 * on the wrong evening, and nothing about the page looks broken — it just
 * links the wrong game, or drops the first match of every session, which is
 * the one people look for.
 */
import {
  SESSION_GRACE_MS,
  matchesInSession,
  spanOf,
  type LinkableMatch,
} from "@/lib/sessionMatches";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const T = (iso: string) => Date.parse(iso);

const m = (over: Partial<LinkableMatch> & { id: number }): LinkableMatch => ({
  startedAt: T("2026-08-20T20:30:00Z"),
  slug: "cup",
  map: "de_dust2",
  ...over,
});

const session = { startedAt: "2026-08-20T20:00:00Z", endedAt: "2026-08-20T22:00:00Z" };

check(
  "a match inside the window belongs to it",
  matchesInSession(session, [m({ id: 1 })]).length === 1,
);

check(
  "a match hours later does not",
  matchesInSession(session, [m({ id: 1, startedAt: T("2026-08-21T02:00:00Z") })]).length === 0,
);

check(
  "a match the day before does not",
  matchesInSession(session, [m({ id: 1, startedAt: T("2026-08-19T20:30:00Z") })]).length === 0,
);

/* ------------------------------------------------------------- boundaries */

check(
  "a match starting on the first millisecond is in",
  matchesInSession(session, [m({ id: 1, startedAt: T(session.startedAt) })]).length === 1,
);

check(
  "a match starting on the last millisecond is in",
  matchesInSession(session, [m({ id: 1, startedAt: T(session.endedAt) })]).length === 1,
);

check(
  "the grace covers a match that starts just after the final round",
  matchesInSession(session, [
    m({ id: 1, startedAt: T(session.endedAt) + SESSION_GRACE_MS - 1000 }),
  ]).length === 1,
);

check(
  "but not one well past it",
  matchesInSession(session, [
    m({ id: 1, startedAt: T(session.endedAt) + SESSION_GRACE_MS + 1000 }),
  ]).length === 0,
);

/* ------------------------------------------------------------ degenerates */

check(
  "a match with no start time is skipped, not crashed on",
  matchesInSession(session, [m({ id: 1, startedAt: null })]).length === 0,
);

check(
  "an unparseable window matches nothing",
  matchesInSession({ startedAt: "not a date", endedAt: "also not" }, [m({ id: 1 })]).length === 0,
);

check("no matches, no links", matchesInSession(session, []).length === 0);

/* ----------------------------------------------------------------- order */

check(
  "results come back oldest first",
  matchesInSession(session, [
    m({ id: 2, startedAt: T("2026-08-20T21:30:00Z") }),
    m({ id: 1, startedAt: T("2026-08-20T20:10:00Z") }),
  ])
    .map((x) => x.id)
    .join() === "1,2",
);

/* ------------------------------------------------------------------ span */

{
  const span = spanOf([
    { startedAt: "2026-08-20T20:00:00Z", endedAt: "2026-08-20T22:00:00Z" },
    { startedAt: "2026-08-18T18:00:00Z", endedAt: "2026-08-18T19:00:00Z" },
  ]);
  check("the span starts at the earliest session", span !== null && span.from.getTime() === T("2026-08-18T18:00:00Z") - SESSION_GRACE_MS);
  check("and ends at the latest", span !== null && span.to.getTime() === T("2026-08-20T22:00:00Z") + SESSION_GRACE_MS);
}

check("no sessions, no span", spanOf([]) === null);

check(
  "a span of unparseable sessions is null rather than Invalid Date",
  spanOf([{ startedAt: "x", endedAt: "y" }]) === null,
);

console.log(fails === 0 ? "\nsessionMatches: all good" : `\nsessionMatches: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
