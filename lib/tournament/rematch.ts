/**
 * The rematch: turning a finished BO1 into a BO3 that is already 1-0.
 *
 * Import-free, like the veto it sits beside, because every question here is
 * decidable from (who won, what was played, who is in the lobby, who has said
 * yes) and those are exactly the answers people argue about afterwards.
 *
 * The shape, and why it is not just "run the veto again":
 *
 *   The map that was played is GAME ONE. It is not replayed and it is not
 *   forgotten — the winner is 1-0 up, which is the whole point of asking for a
 *   rematch rather than starting a fresh match. So the rematch decides two more
 *   maps, and the series is a BO3 whose first game is in the books.
 *
 *   The bans are 1-2-1 rather than alternating, and the loser goes first. That
 *   is the compensation for being 1-0 down: they cut the winner's best map
 *   before the winner cuts anything, and the middle two bans let the winner
 *   shape what is left. Then the winner picks, because they earned it, and what
 *   survives is the decider.
 *
 *   Both maps knife for sides. In a normal veto the team that did not pick a
 *   map chooses its side, which balances the pick — here the pick is the
 *   winner's reward and the loser is already a map down, so handing sides to
 *   either of them by rule is a thumb on the scale. A knife is the neutral
 *   answer and it is what a decider already does.
 */

export type Slot = "a" | "b";

export type RematchStep = {
  /** Which team acts, by outcome rather than by bracket slot. */
  who: "winner" | "loser";
  kind: "ban" | "pick";
};

/**
 * The order of play.
 *
 * Fixed rather than derived from the pool size, unlike the main veto: this
 * sequence is a rule about compensation, not a way of getting down to N maps,
 * and a pool that does not fit it should be refused rather than quietly
 * reshaped into something with different fairness properties.
 */
export const REMATCH_SEQUENCE: readonly RematchStep[] = [
  { who: "loser", kind: "ban" },
  { who: "winner", kind: "ban" },
  { who: "winner", kind: "ban" },
  { who: "loser", kind: "ban" },
  { who: "winner", kind: "pick" },
];

/** Bans plus the pick, plus the decider that is left over. */
export const REMATCH_BANS = REMATCH_SEQUENCE.filter((s) => s.kind === "ban").length;

/**
 * How many maps a rematch pool needs: four bans, one pick, one decider.
 *
 * Six. A seven-map Active Duty pool minus the map just played is exactly six,
 * which is why this works at all and why it is worth stating as a number rather
 * than leaving implied.
 */
export const REMATCH_POOL_SIZE = REMATCH_BANS + 2;

/**
 * What can be played, given the pool and what has already been played.
 *
 * The played maps go because replaying the map somebody just lost on is the
 * one thing a rematch is not. Order is the pool's, so two clients listing the
 * same rematch show the same board.
 */
export function rematchPool(pool: string[], played: string[]): string[] {
  const gone = new Set(played);
  return pool.filter((m) => !gone.has(m));
}

export type RematchReadiness = { ok: true } | { ok: false; error: string };

/**
 * Whether a rematch can be offered at all.
 *
 * Checked before anybody is asked to vote, so a lobby is not gathered around a
 * question that cannot be answered.
 */
export function canOfferRematch(args: {
  /** The finished match's state: only a finished one can be replayed. */
  state: string;
  /** Maps played in the match that just ended. */
  played: string[];
  /** The tournament's map pool. */
  pool: string[];
  /** Whether a rematch of this match already exists. */
  alreadyRematched: boolean;
}): RematchReadiness {
  if (args.state !== "finished") {
    return { ok: false, error: "The match has not finished." };
  }

  if (args.alreadyRematched) {
    return { ok: false, error: "A rematch has already been started." };
  }

  // One map. A rematch of a series is a different thing with a different
  // sequence, and guessing at one would produce a BO3 nobody agreed to.
  if (args.played.length !== 1) {
    return { ok: false, error: "Rematches are for single maps." };
  }

  const usable = rematchPool(args.pool, args.played);
  if (usable.length < REMATCH_POOL_SIZE) {
    return {
      ok: false,
      error: `A rematch needs ${REMATCH_POOL_SIZE} maps left in the pool; there are ${usable.length}.`,
    };
  }

  return { ok: true };
}

/**
 * The sequence resolved to bracket slots.
 *
 * Everything downstream — the board, the API, the audit trail — speaks in "a"
 * and "b", so the winner/loser framing is converted once, here, rather than at
 * every point of use where it could be converted the wrong way round.
 */
export function rematchSteps(winner: Slot): { team: Slot; kind: "ban" | "pick" }[] {
  const loser: Slot = winner === "a" ? "b" : "a";
  return REMATCH_SEQUENCE.map((s) => ({
    team: s.who === "winner" ? winner : loser,
    kind: s.kind,
  }));
}

// ---------------------------------------------------------------- the vote

export type Voter = {
  steamId: string;
  /**
   * The party this player queued with, if any. Everybody who arrived together
   * shares one; a solo player's is null.
   */
  partyId: string | null;
  /** Whether they lead that party. Meaningless when partyId is null. */
  isPartyLeader: boolean;
  isBot: boolean;
};

export type VoteState = {
  /** SteamIDs that have said yes. */
  accepted: string[];
  /** SteamIDs that have said no. One is enough to end it. */
  declined: string[];
};

export type VoteOutcome =
  | { kind: "pending"; waitingOn: string[] }
  | { kind: "accepted" }
  | { kind: "declined"; by: string };

/**
 * Everybody whose answer is still needed.
 *
 * Bots never answer: they have no opinion and waiting for one is how a bot
 * match's rematch never happens. A player covered by their party leader's yes
 * does not answer either — see `coveredBy`.
 */
export function waitingOn(voters: Voter[], votes: VoteState): string[] {
  const said = new Set([...votes.accepted, ...votes.declined]);
  const covered = coveredBy(voters, votes.accepted);

  return voters
    .filter((v) => !v.isBot && !said.has(v.steamId) && !covered.has(v.steamId))
    .map((v) => v.steamId);
}

/**
 * The premade shortcut: a party leader's yes speaks for their party.
 *
 * Five friends who queued together and are sitting in the same voice call
 * should not have to click five times, and the one time that matters — the
 * moment right after a close loss — is exactly when one of them is already
 * typing rather than looking at the page.
 *
 * It only ever ADDS acceptance. A leader cannot decline for anybody: leaving
 * is an individual decision and one person's grievance should not end four
 * other people's evening.
 */
export function coveredBy(voters: Voter[], accepted: string[]): Set<string> {
  const yes = new Set(accepted);

  const leadingParties = new Set(
    voters
      .filter((v) => v.partyId !== null && v.isPartyLeader && yes.has(v.steamId))
      .map((v) => v.partyId as string),
  );

  return new Set(
    voters
      .filter((v) => v.partyId !== null && leadingParties.has(v.partyId))
      .map((v) => v.steamId),
  );
}

/**
 * Where the vote stands.
 *
 * A single no ends it. Unanimity is the rule because a rematch is a new
 * commitment of everybody's next twenty minutes, and a majority that drags one
 * unwilling person back onto the server produces the game nobody enjoys.
 */
export function rematchVote(voters: Voter[], votes: VoteState): VoteOutcome {
  const declined = votes.declined.find((id) => voters.some((v) => v.steamId === id));
  if (declined) return { kind: "declined", by: declined };

  const outstanding = waitingOn(voters, votes);
  return outstanding.length === 0 ? { kind: "accepted" } : { kind: "pending", waitingOn: outstanding };
}
