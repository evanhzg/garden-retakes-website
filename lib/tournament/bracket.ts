// Building brackets.
//
// Pure, and tested, because a bracket is generated once and then played for
// hours: a mistake here is not a bug you notice and fix, it is a tournament that
// has to be restarted. The specific things worth being sure of are that every
// team appears exactly once in the first round, that byes go to the top seeds
// rather than wherever the arithmetic happens to put them, and that every match
// except the final points somewhere.

export type SeededTeam = { id: number; seed: number; name: string };

export type PlannedMatch = {
  /** Unique within the plan, and the index used by the pointers below. */
  ref: number;
  round: number;
  slot: number;
  bestOf: number;
  teamAId: number | null;
  teamBId: number | null;
  /** Where the winner goes, as a ref into the same plan. */
  nextRef: number | null;
  nextSlot: 0 | 1 | null;
  /** Where the loser goes. Only a double-elimination plan sets these. */
  loserNextRef: number | null;
  loserNextSlot: 0 | 1 | null;
  /** A match with one team in it, which resolves without being played. */
  isBye: boolean;
  bracket: "winners" | "losers" | "grand-final";
};

/** The next power of two at or above n. A bracket has to be one. */
export function bracketSize(teamCount: number): number {
  let size = 1;
  while (size < teamCount) size *= 2;
  return Math.max(size, 2);
}

/**
 * Standard seeding order for a bracket of `size`.
 *
 * Produces the pairing everybody expects — 1 plays the lowest seed, and the top
 * two seeds can only meet in the final. Built by reflection: each round doubles
 * the list by pairing every existing entry with its complement, which is the
 * definition of a seeded bracket rather than an approximation of one.
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];

  while (order.length < size) {
    const paired = order.length * 2 + 1;
    const next: number[] = [];

    for (const seed of order) {
      next.push(seed, paired - seed);
    }

    order = next;
  }

  return order;
}

/**
 * A single-elimination bracket.
 *
 * Teams are seeded into `bracketSize` slots and the empty ones become byes. A
 * bye is a match with one team that resolves without being played — modelled as
 * a real match rather than skipped, so the bracket a viewer sees has the shape
 * the tournament actually has and the winner still flows forward by the same
 * rule as everybody else.
 */
export function singleElimination(
  teams: SeededTeam[],
  bestOf: number,
  finalBestOf?: number,
): PlannedMatch[] {
  const seeded = [...teams].sort((a, b) => a.seed - b.seed);
  const size = bracketSize(seeded.length);
  const order = seedOrder(size);

  // Seed positions to team ids; anything past the roster is an empty slot.
  const bySlot = order.map((seed) => seeded[seed - 1]?.id ?? null);

  const matches: PlannedMatch[] = [];
  const rounds = Math.log2(size);

  let ref = 0;
  let previousRefs: number[] = [];

  for (let round = 1; round <= rounds; round++) {
    const inThisRound = size / 2 ** round;
    const refsThisRound: number[] = [];

    for (let slot = 0; slot < inThisRound; slot++) {
      const isFinal = round === rounds;

      const teamAId = round === 1 ? bySlot[slot * 2] : null;
      const teamBId = round === 1 ? bySlot[slot * 2 + 1] : null;

      matches.push({
        ref,
        round,
        slot,
        bestOf: isFinal ? finalBestOf ?? bestOf : bestOf,
        teamAId,
        teamBId,
        nextRef: null,
        nextSlot: null,
        loserNextRef: null,
        loserNextSlot: null,
        // One team present and the other slot genuinely empty — not merely
        // undecided, which is what every later round looks like.
        isBye: round === 1 && (teamAId === null) !== (teamBId === null),
        bracket: "winners",
      });

      refsThisRound.push(ref);
      ref++;
    }

    // Point the round that just finished at the one that was built before it.
    if (previousRefs.length > 0) {
      for (let i = 0; i < previousRefs.length; i++) {
        const feeder = matches[previousRefs[i]];
        feeder.nextRef = refsThisRound[Math.floor(i / 2)];
        feeder.nextSlot = i % 2 === 0 ? 0 : 1;
      }
    }

    previousRefs = refsThisRound;
  }

  return matches;
}

/**
 * A round-robin group.
 *
 * The circle method: fix one team and rotate the rest, which gives every team
 * exactly one match per round and no team two matches in the same round. That
 * second property is what makes a group schedulable across parallel servers at
 * all — a naive all-pairs list has teams playing themselves twice at once.
 */
export function roundRobin(teams: SeededTeam[], bestOf: number): PlannedMatch[] {
  const ids: (number | null)[] = teams.map((t) => t.id);

  // An odd group needs a phantom to rotate against; whoever draws it sits out.
  if (ids.length % 2 === 1) {
    ids.push(null);
  }

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;

  const matches: PlannedMatch[] = [];
  let ref = 0;

  const rotation = [...ids];

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];

      // The phantom's opponent has a bye this round; nothing is scheduled.
      if (a === null || b === null) continue;

      matches.push({
        ref: ref++,
        round,
        slot: i,
        bestOf,
        teamAId: a,
        teamBId: b,
        nextRef: null,
        nextSlot: null,
        loserNextRef: null,
        loserNextSlot: null,
        isBye: false,
        bracket: "winners",
      });
    }

    // Rotate everything except the first.
    const [fixed, ...rest] = rotation;
    rest.unshift(rest.pop()!);
    rotation.splice(0, rotation.length, fixed, ...rest);
  }

  return matches;
}

/**
 * Standings for a group, from the matches played so far.
 *
 * Ordered by wins, then round difference, then rounds won — the usual set, and
 * deliberately not by head-to-head, which cannot be computed for a three-way tie
 * without a rule about what to do when it is circular.
 */
export type Standing = {
  teamId: number;
  played: number;
  won: number;
  lost: number;
  roundsWon: number;
  roundsLost: number;
  diff: number;
};

export function standings(
  teamIds: number[],
  played: { teamAId: number | null; teamBId: number | null; scoreA: number; scoreB: number; finished: boolean }[],
): Standing[] {
  const table = new Map<number, Standing>(
    teamIds.map((id) => [
      id,
      { teamId: id, played: 0, won: 0, lost: 0, roundsWon: 0, roundsLost: 0, diff: 0 },
    ]),
  );

  for (const match of played) {
    if (!match.finished || match.teamAId === null || match.teamBId === null) continue;

    const a = table.get(match.teamAId);
    const b = table.get(match.teamBId);
    if (!a || !b) continue;

    a.played++;
    b.played++;
    a.roundsWon += match.scoreA;
    a.roundsLost += match.scoreB;
    b.roundsWon += match.scoreB;
    b.roundsLost += match.scoreA;

    if (match.scoreA > match.scoreB) {
      a.won++;
      b.lost++;
    } else if (match.scoreB > match.scoreA) {
      b.won++;
      a.lost++;
    }
  }

  const rows = Array.from(table.values());

  for (const row of rows) {
    row.diff = row.roundsWon - row.roundsLost;
  }

  return rows.sort(
    (x, y) => y.won - x.won || y.diff - x.diff || y.roundsWon - x.roundsWon || x.teamId - y.teamId,
  );
}

/**
 * The match a bye resolves into, and the team that walks through it.
 *
 * Returned rather than applied so the caller decides when it happens — a bye
 * that resolves at generation time makes a bracket that has already started
 * before anybody has seen it.
 */
export function resolveByes(matches: PlannedMatch[]): PlannedMatch[] {
  const byRef = new Map(matches.map((m) => [m.ref, m]));

  for (const match of matches) {
    if (!match.isBye) continue;

    const winner = match.teamAId ?? match.teamBId;
    if (winner === null || match.nextRef === null) continue;

    const next = byRef.get(match.nextRef);
    if (!next) continue;

    if (match.nextSlot === 0) {
      next.teamAId = winner;
    } else {
      next.teamBId = winner;
    }
  }

  return matches;
}

/**
 * The shape a bracket will take, before it has one.
 *
 * A tournament with no stages yet showed a single line of grey text saying so,
 * which tells an organizer nothing about what they are building and tells a
 * visitor nothing about what they are entering. This returns the same match
 * shape the real bracket uses, with every slot empty, so the tree can be drawn
 * as a preview from the moment the team count is set.
 *
 * Built from `singleElimination` rather than from its own arithmetic — the
 * preview and the real thing then cannot disagree about how many rounds an
 * eleven-team bracket has, or where the byes fall.
 *
 * Ids are negative so they can never collide with a real match id, and so the
 * caller can tell a placeholder from a real match without a second flag.
 */
export function placeholderBracket(maxTeams: number, bestOf = 1, finalBestOf?: number) {
  const size = bracketSize(Math.max(2, maxTeams));

  // Synthetic seeds, purely to make the plan the right size. Their ids are
  // discarded below; only the round/slot structure survives.
  const teams: SeededTeam[] = Array.from({ length: size }, (_, i) => ({
    id: -(i + 1),
    seed: i + 1,
    name: "",
  }));

  return singleElimination(teams, bestOf, finalBestOf).map((m, i) => ({
    id: -(i + 1),
    round: m.round,
    slot: m.slot,
    bestOf: m.bestOf,
    state: "pending",
    teamA: null,
    teamB: null,
    scoreA: 0,
    scoreB: 0,
    winnerTeamId: null,
  }));
}
