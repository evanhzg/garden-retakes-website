/**
 * The rules an edition of a tournament runs by.
 *
 * Deliberately import-free, the house rule for the decidable parts of this
 * codebase. Everything here answers a question that has one correct answer
 * given some numbers — who can register, whether it has started, whose veto
 * turn it is, how long they have left — and none of it needs a database to say
 * so, which is what makes it testable.
 */

export type Visibility = "public" | "invite";
export type Seeding = "random" | "faceit" | "manual";
export type Format = "single" | "double" | "group" | "swiss";

/** How long a team gets for one veto action. */
export const VETO_TURN_SECONDS = 30;

export type EditionState = {
  published: boolean;
  /** draft | registration | live | finished | cancelled */
  state: string;
  visibility: Visibility;
  maxTeams: number;
  teamCount: number;
  startsAt: Date | null;
  startedAt: Date | null;
};

/** A tournament nobody but an organizer can see yet. */
export const isHidden = (e: EditionState): boolean => !e.published;

export const hasStarted = (e: EditionState): boolean => e.startedAt !== null;

export const isFull = (e: EditionState): boolean => e.teamCount >= e.maxTeams;

/**
 * Whether the settings that shape the bracket may still be changed.
 *
 * The line is the start button, not the scheduled time. An organizer who
 * starts late still expects to be able to fix the format at 19:59; one who has
 * already started cannot, because matches exist and a format change would
 * orphan them.
 */
export const canEditFormat = (e: EditionState): boolean => !hasStarted(e);

/** Why registration is closed, or null when it is open. */
export function registrationBlockedReason(
  e: EditionState,
  hasInvite: boolean,
): "started" | "wrong-state" | "full" | "invite-only" | null {
  // Published is deliberately NOT checked here any more.
  //
  // It used to return "not-published" and the register page turned that into a
  // 404, which meant the link an organizer copied out of their own browser was
  // dead for every person they sent it to — a tournament is created
  // unpublished, so that was every link until somebody found the toggle. The
  // organizer had done the one thing that signals intent, and the site answered
  // "this does not exist".
  //
  // Published is a LISTING flag: it decides whether the hub shows the
  // tournament, and the hub still filters on it. Whether a stranger may enter
  // is what Visibility is for, and that is checked below.
  if (hasStarted(e)) return "started";
  if (e.state !== "registration") return "wrong-state";

  // Full is checked before the invite gate on purpose: somebody arriving with a
  // valid link to a full tournament should be told it is full, which is a fact
  // about the tournament, rather than that their link is bad, which is a fact
  // about them and is untrue.
  if (isFull(e)) return "full";
  if (e.visibility === "invite" && !hasInvite) return "invite-only";

  return null;
}

export const canRegister = (e: EditionState, hasInvite: boolean): boolean =>
  registrationBlockedReason(e, hasInvite) === null;

/**
 * One line of a bracket, as far as "has this been won" is concerned.
 *
 * Two fields on purpose. Scores, maps and rosters say nothing about whether the
 * event is over, and naming them here would tie the rule to the database row it
 * happens to be read off.
 */
export type BracketLine = { round: number; winnerTeamId: number | null };

/**
 * The match that decides the tournament, or null when the bracket has no single
 * one.
 *
 * The final is the last round of the BRACKET, not the last round played. Taking
 * the deepest round among FINISHED matches instead calls a first-round winner
 * the champion of a tournament that has barely started — the bracket's own
 * depth is the only thing that says which match is the final.
 *
 * Two matches in the deepest round means this is not a complete single-winner
 * bracket: a group stage, or a final row that was never generated. Picking one
 * of them would crown whichever happened to be first in the list, so null — "it
 * cannot be said" — is the honest answer.
 */
export function decidingMatch<T extends BracketLine>(matches: readonly T[]): T | null {
  if (matches.length === 0) return null;

  const finalRound = Math.max(...matches.map((m) => m.round));
  const lastRound = matches.filter((m) => m.round === finalRound);

  return lastRound.length === 1 ? lastRound[0] : null;
}

/** Whether the bracket has produced a champion. */
export const bracketDecided = (matches: readonly BracketLine[]): boolean =>
  decidingMatch(matches)?.winnerTeamId != null;

/**
 * The state to SHOW, which is not always the state that is stored.
 *
 * Nothing ever writes Tournament.State back to "finished". Starting an event
 * sets it to "live", and the last match of a bracket has no idea it was the
 * last — so a tournament whose final was played weeks ago still reads
 * "In progress" on its own page and on every card in the list, directly above a
 * podium naming the team that won it.
 *
 * Derived rather than repaired on read. A page render that writes fires for
 * every visitor, including the ones merely looking at somebody else's event,
 * and turns a bracket bug into a row nobody can explain. The row stays as the
 * organizer left it; what is shown tells the truth.
 */
export function displayedState(state: string, decided: boolean): string {
  if (!decided) return state;

  // Cancelled outranks a result. An event called off after its final was played
  // is still cancelled, and overriding that erases the only record that it was.
  return state === "cancelled" ? state : "finished";
}

/**
 * What the page should say about time, and what it should count down to.
 *
 * The countdown only appears on the last day. A tournament three weeks out
 * showing "20d 4h 13m" is noise that changes nothing; one showing minutes is
 * information somebody acts on.
 */
export type Countdown =
  | { kind: "none" }
  | { kind: "scheduled"; startsAt: Date }
  | { kind: "counting"; msRemaining: number }
  | { kind: "starting-soon" }
  | { kind: "live" };

/** Inside this window before the start, a live countdown is shown. */
export const COUNTDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function countdown(e: EditionState, now: Date): Countdown {
  if (hasStarted(e)) return { kind: "live" };
  if (!e.startsAt) return { kind: "none" };

  const ms = e.startsAt.getTime() - now.getTime();

  // Past its time and still not started. Not an error — starting late is
  // explicitly allowed — so it says the true thing and waits for the button.
  if (ms <= 0) return { kind: "starting-soon" };
  if (ms <= COUNTDOWN_WINDOW_MS) return { kind: "counting", msRemaining: ms };

  return { kind: "scheduled", startsAt: e.startsAt };
}

/** "4h 12m", "12m 30s", "45s" — the largest two units that matter. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

/**
 * Whether the veto may begin.
 *
 * Two ways in, deliberately. Both teams pressing READY is the normal path and
 * needs no admin present; an admin forcing it is the escape hatch for the team
 * that is on the server but not on the website, which at a real event is most
 * of them.
 */
export const vetoMayStart = (readyA: boolean, readyB: boolean, forced: boolean): boolean =>
  forced || (readyA && readyB);

/** Milliseconds left in the current veto turn; 0 once it has run out. */
export function vetoRemaining(deadline: Date | null, now: Date): number {
  if (!deadline) return 0;
  return Math.max(0, deadline.getTime() - now.getTime());
}

export const vetoExpired = (deadline: Date | null, now: Date): boolean =>
  deadline !== null && vetoRemaining(deadline, now) === 0;

/**
 * Seeds a list of teams.
 *
 * `faceit` sorts by the team's average FACEIT level, best first, so seed 1 is
 * the strongest side. Teams with no level at all sort last rather than as zero
 * — an unranked team is unknown, not bad, and putting them at the bottom is a
 * choice we can defend where pretending they are the worst is not.
 *
 * `random` shuffles with the caller's own random function so a test can pin it.
 * `manual` keeps the order given, which is whatever the organizer arranged.
 */
export function seedTeams<T extends { id: number; faceitAverage?: number | null }>(
  teams: readonly T[],
  seeding: Seeding,
  random: () => number = Math.random,
): T[] {
  const out = [...teams];

  if (seeding === "manual") return out;

  if (seeding === "faceit") {
    return out.sort((a, b) => {
      const left = a.faceitAverage ?? null;
      const right = b.faceitAverage ?? null;

      if (left === null && right === null) return a.id - b.id;
      if (left === null) return 1;
      if (right === null) return -1;

      // Higher level is a better seed. Ties break on id so the order is stable
      // rather than dependent on the sort implementation.
      return right - left || a.id - b.id;
    });
  }

  // Fisher-Yates. Not sort(() => random() - 0.5), which is not a shuffle: it
  // biases heavily and the bias differs between engines.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

/**
 * The team sizes a tournament may run at.
 *
 * 1 and 2 exist for playtesting — getting six people onto a server to find out
 * whether the veto works is a poor trade, and a 1v1 exercises the same match
 * pipeline. 5 is here because somebody will eventually ask.
 */
export const TEAM_SIZES = [1, 2, 3, 5] as const;

export const isPlaytestSize = (teamSize: number): boolean => teamSize <= 2;
