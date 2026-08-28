/**
 * The rules an organizer is allowed to break, and the ones nobody is.
 *
 * Everything here exists because a tournament is a live event and live events go
 * wrong in ways the happy path refuses: a player cannot sign in ten minutes
 * before their match, somebody brings a substitute, two teams were seeded into
 * the wrong halves, a match was started against the wrong opponent. The ordinary
 * flows correctly say no to all of it — you cannot join a tournament that has
 * started, you cannot exceed the roster cap — and an organizer standing in front
 * of six people waiting to play needs a yes.
 *
 * So the interesting thing here is not permission. It is the DIFFERENCE between
 * a rule that exists to keep the event orderly and one that exists to keep the
 * data true:
 *
 *   - a **warning** is a rule an override may break. The event is the authority;
 *     the rule was a default. The organizer is told what they are doing and does
 *     it.
 *   - a **blocker** is a rule an override may NOT break, because breaking it
 *     produces a tournament that cannot be read afterwards — a player counted
 *     twice, a bracket that disagrees with itself. These are refused however
 *     senior the person asking, and the refusal names the fix.
 *
 * Import-free and tested, because this is the module that decides whether a
 * thing is merely unusual or actually wrong, and getting that backwards means
 * either an organizer who cannot run their event or a bracket nobody can trust.
 */

export type ExceptionVerdict = {
  /** False when something is refused outright. */
  ok: boolean;
  /** Refusals. Present only when ok is false. */
  blockers: string[];
  /** Rules being deliberately broken. The caller confirms these. */
  warnings: string[];
};

const verdict = (blockers: string[], warnings: string[]): ExceptionVerdict => ({
  ok: blockers.length === 0,
  blockers,
  warnings,
});

/** Where a player already is, as far as this tournament is concerned. */
export type ExistingMembership = {
  teamId: number;
  teamName: string;
  /** invited | accepted | declined | removed */
  status: string;
};

export type SubstitutionInput = {
  /** The team they are being put on. */
  teamId: number;
  teamName: string;
  /** Roster slots a team is meant to field. */
  teamSize: number;
  /** Members already on that team, not counting removed ones. */
  currentRosterSize: number;
  /** Whether the tournament has begun. */
  tournamentStarted: boolean;
  /** Every membership this player already holds IN THIS TOURNAMENT. */
  existing: ExistingMembership[];
  /** True when the organizer has ticked the box that says they mean it. */
  override: boolean;
  /** Whether the id looks like a SteamID64 at all. */
  steamIdValid: boolean;
};

/**
 * Whether a player may be dropped onto a team by hand.
 *
 * The one hard refusal is a player already on a DIFFERENT team in the same
 * tournament, and it is hard because it is the invariant every later count
 * rests on: their stats would land on two teams, and a bracket where somebody
 * played for both semi-finalists cannot be reported. The fix is to remove them
 * from the other team first, which the message says, because "no" without a
 * next step is where an organizer gets stuck.
 *
 * Everything else — the tournament having started, the roster being full, the
 * player never having accepted an invite — is a default the organizer outranks.
 */
export function checkSubstitution(input: SubstitutionInput): ExceptionVerdict {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.steamIdValid) {
    blockers.push("That is not a SteamID64. It is 17 digits and starts 7656119.");
  }

  const elsewhere = input.existing.filter(
    (m) => m.teamId !== input.teamId && m.status !== "removed" && m.status !== "declined",
  );

  for (const m of elsewhere) {
    blockers.push(
      `Already on ${m.teamName} in this tournament. Remove them from ${m.teamName} first, ` +
        "or their stats would count for both teams.",
    );
  }

  const here = input.existing.find((m) => m.teamId === input.teamId);
  if (here && here.status !== "removed" && here.status !== "declined") {
    // Not a blocker and not a warning: it is already true. The caller turns
    // this into a no-op rather than an error.
    return verdict(blockers, warnings);
  }

  if (!input.override) {
    if (input.tournamentStarted) {
      blockers.push("That tournament has started. Tick the override to add them anyway.");
    }

    if (input.currentRosterSize >= input.teamSize + 2) {
      blockers.push(`${input.teamName} is full. Tick the override to add them anyway.`);
    }

    return verdict(blockers, warnings);
  }

  if (input.tournamentStarted) {
    warnings.push("The tournament has already started.");
  }

  if (input.currentRosterSize >= input.teamSize + 2) {
    warnings.push(`${input.teamName} is over its roster cap of ${input.teamSize + 2}.`);
  }

  if (here && (here.status === "removed" || here.status === "declined")) {
    warnings.push("They were previously removed from this team and are being put back.");
  }

  return verdict(blockers, warnings);
}

export type MatchTeamChangeInput = {
  /** pending | ready | live | finished */
  matchState: string;
  /** The team being put into the slot, and the one coming out. */
  incomingTeamId: number | null;
  outgoingTeamId: number | null;
  /** The team in the OTHER slot of this match. */
  otherTeamId: number | null;
  /** Whether any map of this match has a score or stats against it. */
  hasPlayed: boolean;
  /** Whether the match has already advanced somebody into a later round. */
  hasAdvanced: boolean;
  override: boolean;
};

/**
 * Whether a match's teams may be changed.
 *
 * A match with the wrong teams in it is a real and recoverable mistake — a
 * bracket generated before a withdrawal, a seed entered wrong — and fixing it is
 * ordinary work right up until the moment it has been played.
 *
 * The hard refusal is a team facing itself, which is not a tournament state at
 * all: the veto has two sides, the bracket has a winner and a loser, and neither
 * means anything when both are the same team.
 *
 * Rounds already played are a warning rather than a refusal. It costs the
 * organizer an explicit confirmation and leaves the choice with them, because
 * "we started the match against the wrong opponent" is exactly the situation
 * this is for, and a refusal there would make the tool useless in the only case
 * it was built for.
 */
export function checkMatchTeamChange(input: MatchTeamChangeInput): ExceptionVerdict {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.incomingTeamId !== null && input.incomingTeamId === input.otherTeamId) {
    blockers.push("A team cannot play itself. Change the other slot first.");
  }

  if (input.incomingTeamId === input.outgoingTeamId) {
    // Nothing is happening. Not an error, just not a change.
    return verdict(blockers, warnings);
  }

  if (!input.override && (input.hasPlayed || input.matchState === "live")) {
    blockers.push(
      input.matchState === "live"
        ? "That match is live. Tick the override to change its teams anyway."
        : "That match has rounds played against it. Tick the override to change its teams anyway.",
    );
    return verdict(blockers, warnings);
  }

  if (input.hasPlayed) {
    warnings.push("Rounds have been played. The scores stay with the match, not with the team.");
  }

  if (input.matchState === "live") {
    warnings.push("The match is live. The server will be told, and players will be moved.");
  }

  if (input.matchState === "finished") {
    warnings.push("The match is finished.");
  }

  if (input.hasAdvanced) {
    warnings.push("A team has already advanced from this match. The next round will be corrected.");
  }

  return verdict(blockers, warnings);
}

/** A SteamID64, as strictly as it can be checked without asking Steam. */
export function looksLikeSteamId(value: string): boolean {
  const s = value.trim();
  if (!/^\d{17}$/.test(s)) return false;

  // The individual-account range. Everything a person can sign in with starts
  // 7656119, and accepting anything else lets a group or clan id through, which
  // resolves to no player and produces a roster row nobody can explain.
  return s.startsWith("7656119");
}
