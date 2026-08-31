// The map veto.
//
// Load-bearing beyond choosing maps: it is also what decides the SIDES on every
// map except the decider. After a team picks a map, the other team says which
// side it starts on — so a picked map arrives at the server with its sides
// already settled and needs no knife round. Only the decider, and a BO1, knife
// for it.
//
// Pure on purpose. A veto is the part of a tournament that gets argued about
// afterwards, and "the site says so" only settles an argument if the site was
// right — which is much easier to be sure of when the rules are a function of
// (pool, best-of, actions so far) rather than a pile of route handlers.

export type VetoKind = "ban" | "pick" | "side";

export type Side = "T" | "CT";

export type VetoAction = {
  ordinal: number;
  /** Null only for the implicit final map, which nobody chooses. */
  teamId: number | null;
  kind: VetoKind;
  map?: string | null;
  side?: Side | null;
  wasAuto?: boolean;
};

export type VetoStep = {
  /** Which team acts: "A" or "B" — resolved to an id by the caller. */
  team: "A" | "B";
  kind: VetoKind;
};

export type VetoState = {
  /** Maps still available, in pool order. */
  remaining: string[];
  /** Maps chosen so far, in play order, with how each was settled. */
  picked: {
    map: string;
    pickedBy: "A" | "B" | null;
    sideChosenBy: "A" | "B" | null;
    startSideTeamA: Side | null;
    isDecider: boolean;
  }[];
  /** What happens next, or null when the veto is over. */
  next: VetoStep | null;
  done: boolean;
};

/**
 * The sequence for a best-of, given how many maps are in the pool.
 *
 * Derived rather than tabulated, because the pool is admin-editable: a pool of
 * five and a pool of nine both have to work, and a hard-coded seven-map
 * sequence would quietly break the day somebody removes a map.
 *
 * The shape is always the same — ban down to the picks, alternate the picks,
 * ban down to one — and each pick is followed by the *other* team choosing
 * sides.
 */
export function sequenceFor(bestOf: number, poolSize: number): VetoStep[] {
  const steps: VetoStep[] = [];

  // A BO1 is bans until one map is left. Nobody picks it, so nobody has earned
  // the right to choose sides on it either: it knifes.
  if (bestOf <= 1) {
    for (let i = 0; i < poolSize - 1; i++) {
      steps.push({ team: i % 2 === 0 ? "A" : "B", kind: "ban" });
    }
    return steps;
  }

  // A BO3 plays two picked maps and a decider; a BO5 plays four and a decider.
  const picks = bestOf - 1;
  const bansBefore = Math.max(0, Math.min(2, poolSize - picks - 1));

  let turn: "A" | "B" = "A";
  const flip = () => (turn = turn === "A" ? "B" : "A");

  for (let i = 0; i < bansBefore; i++) {
    steps.push({ team: turn, kind: "ban" });
    flip();
  }

  for (let i = 0; i < picks; i++) {
    const picker = turn;
    steps.push({ team: picker, kind: "pick" });

    // The team that did NOT pick chooses the side. That is the balance: you get
    // the map you know, they get the half they want on it.
    steps.push({ team: picker === "A" ? "B" : "A", kind: "side" });
    flip();
  }

  // Whatever is left over gets banned down to the decider.
  const banned = bansBefore;
  const remainingAfterPicks = poolSize - banned - picks;
  for (let i = 0; i < remainingAfterPicks - 1; i++) {
    steps.push({ team: turn, kind: "ban" });
    flip();
  }

  return steps;
}

/**
 * Replays the actions taken so far and says where the veto stands.
 *
 * Recomputed from the action list every time rather than kept as mutable state:
 * the actions are what is stored, so deriving from them means the page, the API
 * and the audit trail cannot disagree with each other.
 */
export function vetoState(
  pool: string[],
  bestOf: number,
  actions: VetoAction[],
  /**
   * The order of play, when it is not the one a best-of implies.
   *
   * A rematch is the case this exists for: its bans are 1-2-1 with the loser
   * first and neither team picks a side, which is a rule about compensating
   * the team that is a map down rather than a way of getting a pool down to N.
   * `sequenceFor` would answer with a standard BO3 — alternating bans, and a
   * side-pick after each map — which is a different game.
   *
   * Everything downstream of the sequence is unchanged: the replay, the
   * decider, the audit trail. Only the order differs.
   */
  sequence?: VetoStep[],
): VetoState {
  const steps = sequence ?? sequenceFor(bestOf, pool.length);
  const ordered = [...actions].sort((a, b) => a.ordinal - b.ordinal);

  const remaining = [...pool];
  const picked: VetoState["picked"] = [];

  for (let i = 0; i < ordered.length && i < steps.length; i++) {
    const action = ordered[i];
    const step = steps[i];

    if (action.kind === "ban" && action.map) {
      const at = remaining.indexOf(action.map);
      if (at >= 0) remaining.splice(at, 1);
      continue;
    }

    if (action.kind === "pick" && action.map) {
      const at = remaining.indexOf(action.map);
      if (at >= 0) remaining.splice(at, 1);

      picked.push({
        map: action.map,
        pickedBy: step.team,
        sideChosenBy: null,
        startSideTeamA: null,
        isDecider: false,
      });
      continue;
    }

    if (action.kind === "side" && action.side) {
      const last = picked[picked.length - 1];
      if (!last) continue;

      last.sideChosenBy = step.team;

      // The chooser names the side THEY want; what is stored is the side team A
      // starts on, because that is what the server is told. Getting this
      // backwards puts both teams on the wrong half of every picked map, and it
      // is invisible until somebody spawns.
      last.startSideTeamA =
        step.team === "A" ? action.side : action.side === "T" ? "CT" : "T";
    }
  }

  const done = ordered.length >= steps.length;

  // The last map standing is the decider. It is added only once the bans are
  // finished, so a half-finished veto does not show a decider that could still
  // be banned.
  if (done && remaining.length > 0) {
    picked.push({
      map: remaining[0],
      pickedBy: null,
      sideChosenBy: null,
      startSideTeamA: null,
      isDecider: true,
    });
  }

  return {
    remaining,
    picked,
    next: done ? null : steps[ordered.length] ?? null,
    done,
  };
}

/**
 * Whether a proposed action is the one the veto is actually waiting for.
 *
 * Checked server-side even though the UI only offers legal moves: two captains
 * clicking at once is normal, and the second click must be refused rather than
 * applied out of turn.
 */
export function validateAction(
  pool: string[],
  bestOf: number,
  actions: VetoAction[],
  proposed: { team: "A" | "B"; kind: VetoKind; map?: string | null; side?: Side | null },
): { ok: true } | { ok: false; error: string } {
  const state = vetoState(pool, bestOf, actions);

  if (!state.next) {
    return { ok: false, error: "The veto is finished." };
  }

  if (state.next.team !== proposed.team) {
    return { ok: false, error: "It is not your turn." };
  }

  if (state.next.kind !== proposed.kind) {
    return { ok: false, error: `Expected a ${state.next.kind}, not a ${proposed.kind}.` };
  }

  if (proposed.kind === "side") {
    return proposed.side === "T" || proposed.side === "CT"
      ? { ok: true }
      : { ok: false, error: "Pick T or CT." };
  }

  if (!proposed.map) {
    return { ok: false, error: "Pick a map." };
  }

  if (!state.remaining.includes(proposed.map)) {
    return { ok: false, error: "That map is already gone." };
  }

  return { ok: true };
}

/**
 * What to do when a captain's turn runs out.
 *
 * A veto that can stall forever stalls a bracket, and a bracket that stalls
 * stalls a broadcast. The turn is therefore taken for them, and recorded as
 * automatic so nobody has to guess later whether it was deliberate.
 *
 * The map is drawn at random from what is left rather than taken in pool order.
 * Pool order is fixed, so "first still available" made every timed-out veto
 * produce the same answer — the top of the pool was banned first in every
 * bracket where somebody went afk, and on a decider it meant the same map was
 * played every time. That is not a neutral default, it is a standing bias in
 * favour of whatever sorts first, and a team that noticed could use it.
 *
 * `random` is a parameter so the choice can be pinned in a test. Defaulting it
 * here rather than at the call sites keeps every caller honestly random without
 * having to remember to be.
 *
 * The side is still T. A side is one of two rather than one of seven, so there
 * is no ordering to exploit — and a coin flip on which end of a knife round you
 * start is a different question from which maps get played, worth deciding
 * deliberately rather than as a side effect of this change.
 */
export function autoAction(
  pool: string[],
  bestOf: number,
  actions: VetoAction[],
  random: () => number = Math.random,
  /** The order of play, when it is not the one the best-of implies. */
  sequence?: VetoStep[],
): { kind: VetoKind; map?: string; side?: Side } | null {
  const state = vetoState(pool, bestOf, actions, sequence);
  if (!state.next) return null;

  if (state.next.kind === "side") {
    return { kind: "side", side: "T" };
  }

  if (state.remaining.length === 0) return null;

  // Clamped, because a `random` that returns exactly 1 — or anything outside
  // [0, 1) from a caller's own source — would index past the end and auto-pick
  // undefined, which reads downstream as "no map" rather than as a bad draw.
  const at = Math.min(state.remaining.length - 1, Math.floor(random() * state.remaining.length));

  return { kind: state.next.kind, map: state.remaining[at] };
}
