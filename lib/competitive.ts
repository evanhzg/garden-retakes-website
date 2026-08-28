// Blitz: skill levels, the rating maths, roles, and the economy.
//
// One module, because these four things constrain each other and drifting them
// apart is how a page ends up explaining an economy the server does not run.
// The plugin mirrors these constants; anything changed here has to be changed
// there too, and the numbers are named rather than inlined so that diff is
// readable.
//
// This is a game mode, not a simulation of the last twenty seconds of a normal
// round. The economy below is designed for it: short rounds, small teams, and
// a defending side that starts with the bomb already down.

// ---------------------------------------------------------------- skill levels

/**
 * Ten levels, the way people already read them.
 *
 * The bands are not evenly spaced. Levels 1-3 are wide because a new player's
 * rating moves a long way in a few games and narrow bands there would mean a
 * badge that changes every night; 8-10 are narrow because that is where the
 * difference between players is small and worth showing.
 */
export const LEVELS = [
  { level: 1, min: 0, max: 599, colour: "#8d8d8d", label: "Level 1" },
  { level: 2, min: 600, max: 749, colour: "#9fbf6a", label: "Level 2" },
  { level: 3, min: 750, max: 899, colour: "#8fc04f", label: "Level 3" },
  { level: 4, min: 900, max: 1049, colour: "#6fbf3f", label: "Level 4" },
  { level: 5, min: 1050, max: 1199, colour: "#e8c93a", label: "Level 5" },
  { level: 6, min: 1200, max: 1349, colour: "#e8b02a", label: "Level 6" },
  { level: 7, min: 1350, max: 1499, colour: "#e89020", label: "Level 7" },
  { level: 8, min: 1500, max: 1649, colour: "#e8701c", label: "Level 8" },
  { level: 9, min: 1650, max: 1799, colour: "#e0451c", label: "Level 9" },
  { level: 10, min: 1800, max: Infinity, colour: "#d81f1f", label: "Level 10" },
] as const;

export type Level = (typeof LEVELS)[number]["level"];

/** Where everyone starts, and what an unplaced player is measured against. */
export const STARTING_ELO = 1000;

/** Games before a rating is shown as a level rather than as placements. */
export const PLACEMENT_MATCHES = 10;

export const levelOf = (elo: number): (typeof LEVELS)[number] =>
  LEVELS.find((l) => elo >= l.min && elo <= l.max) ?? LEVELS[0];

/** How far through the current level, 0-1, for a progress bar. */
export function levelProgress(elo: number): number {
  const l = levelOf(elo);
  if (!Number.isFinite(l.max)) return 1;
  return Math.max(0, Math.min(1, (elo - l.min) / (l.max - l.min + 1)));
}

export const eloToNextLevel = (elo: number): number | null => {
  const l = levelOf(elo);
  return Number.isFinite(l.max) ? l.max + 1 - elo : null;
};

// ------------------------------------------------------------------ the rating

/** Base swing for an even match. */
export const ELO_BASE = 30;

/**
 * How far the rating gap can move the base, either way.
 *
 * Beating a much stronger team is worth more and costs them more; the reverse
 * is worth less. Capped rather than unbounded so a single mismatched game can
 * never be worth a level.
 */
export const ELO_GAP_MAX = 12;

/** The rating difference at which the gap adjustment is fully applied. */
export const ELO_GAP_FULL = 300;

/**
 * Individual performance, as a multiplier on the base.
 *
 * Deliberately asymmetric. Playing well in a loss should visibly soften it,
 * because the alternative is that the only way to protect a rating is to avoid
 * queuing; playing badly in a win should not erase the win, because the team
 * still won and rating is a team outcome first.
 */
/**
 * How far performance can move the magnitude, in each direction.
 *
 * `better` is what a good game does to the swing, `worse` what a bad one does.
 * On a win a good game means more; on a loss it means less — the sign of the
 * result is applied afterwards, so both of these describe the *size* of the
 * change and neither ever flips it.
 *
 * Asymmetric on purpose. A good game can add 40% to a win and take 25% off a
 * loss; a bad game only takes 20% off a win and adds 15% to a loss. Playing
 * well should be worth more than playing badly costs, because the alternative
 * is that the safest way to protect a rating is to stop queuing.
 */
export const PERF_WIN = { better: 1.4, worse: 0.8 } as const;
export const PERF_LOSS = { better: 0.75, worse: 1.15 } as const;

/**
 * Performance as a multiplier on the magnitude, hinged at 1.0 for an average
 * game so the headline ±30 is what an average game actually pays.
 *
 * The hinge matters twice over: a straight interpolation would put an average
 * game at 1.07, so the stated number would be a lie, and it would also mean a
 * *better* game in a loss cost more rather than less, because the curve only
 * knew which end was bigger and not which end was good.
 */
function performanceMultiplier(performance: number, won: boolean): number {
  const ends = won ? PERF_WIN : PERF_LOSS;
  const p = Math.max(0, Math.min(1, performance));
  return p >= 0.5
    ? 1 + (ends.better - 1) * ((p - 0.5) / 0.5)
    : 1 + (ends.worse - 1) * ((0.5 - p) / 0.5);
}

/**
 * Placements move faster.
 *
 * Ten games is not many, and a new player who is plainly a level 8 should not
 * have to grind out of level 4 to get there.
 */
export const PLACEMENT_MULTIPLIER = 2;

export type MatchOutcome = {
  won: boolean;
  /** This player's rating before the match. */
  elo: number;
  /** Mean rating of the opposing side. */
  opponentElo: number;
  /**
   * Where this player's contribution sat in the match, 0-1, where 0.5 is
   * exactly the average of the ten players on the server.
   */
  performance: number;
  /** Matches this player has completed, before this one. */
  matchesPlayed: number;
};

export type EloChange = {
  delta: number;
  base: number;
  gapAdjustment: number;
  performanceMultiplier: number;
  placement: boolean;
  eloBefore: number;
  eloAfter: number;
};

/**
 * What a match is worth.
 *
 * Order matters: the gap adjusts the base, performance scales the result, and
 * placements multiply the whole thing. Applying performance before the gap
 * would let a strong individual game on a heavily favoured team out-earn the
 * same game against a stronger opponent, which is backwards.
 */
export function eloChange(o: MatchOutcome): EloChange {
  const gapRaw = (o.opponentElo - o.elo) / ELO_GAP_FULL;
  const gap = Math.max(-1, Math.min(1, gapRaw)) * ELO_GAP_MAX;

  // Facing stronger opponents: more for a win, less lost for a defeat.
  const base = o.won ? ELO_BASE + gap : ELO_BASE - gap;

  const multiplier = performanceMultiplier(o.performance, o.won);

  const placement = o.matchesPlayed < PLACEMENT_MATCHES;
  const magnitude = base * multiplier * (placement ? PLACEMENT_MULTIPLIER : 1);

  const delta = Math.round(o.won ? magnitude : -magnitude);
  // A rating floor, so a bad run cannot put someone below the bottom of the
  // scale and leave them unable to be matched with anyone.
  const eloAfter = Math.max(100, o.elo + delta);

  return {
    delta: eloAfter - o.elo,
    base: Math.round(base * 10) / 10,
    gapAdjustment: Math.round(gap * 10) / 10,
    performanceMultiplier: Math.round(multiplier * 100) / 100,
    placement,
    eloBefore: o.elo,
    eloAfter,
  };
}

/** Rating lost for abandoning a match, on top of the loss itself. */
export const ABANDON_PENALTY = 50;
/** How long someone has to come back before it counts as abandoning. */
export const RECONNECT_GRACE_SECONDS = 120;

// ------------------------------------------------------------------- matchmaking

/**
 * Which side of the rating range a mixed lobby is pulled towards.
 *
 * A party of two 1800s queueing with a 900 is not an average-1500 team — they
 * will run the game and the 900 will be a passenger. Weighting the mean towards
 * the top makes the lobby it gets matched into closer to the game it will
 * actually play. The weight scales with how wide the party's own spread is, so
 * an evenly matched trio is still judged on its average.
 */
export function effectiveElo(members: number[]): number {
  if (members.length === 0) return STARTING_ELO;
  if (members.length === 1) return members[0];

  const mean = members.reduce((a, b) => a + b, 0) / members.length;
  const top = Math.max(...members);
  const spread = top - Math.min(...members);

  // No skew worth applying below a level's width; full skew by three levels.
  const skew = Math.max(0, Math.min(1, (spread - 150) / 450));
  return Math.round(mean + (top - mean) * skew);
}

/** How far apart two lobbies may be, widening the longer someone waits. */
export function acceptableGap(secondsWaiting: number): number {
  return 100 + Math.min(900, secondsWaiting * 12);
}

// ------------------------------------------------------------------------ roles

/**
 * Four roles, one per player.
 *
 * A retake is four seconds of contact between two or three people. The seven
 * roles a five-man match needs describe jobs that do not exist here — there is
 * no lurk, and nobody is rotating. What is left is who goes first, who trades
 * them, who holds the angle, and who carries the utility.
 *
 * Unique within a team on purpose: two entries is not a plan, and the point of
 * declaring a role is that the other one or two know what you are doing.
 */
export const ROLES = [
  { id: "entry", exclusive: true },
  { id: "support", exclusive: true },
  { id: "sniper", exclusive: true },
  { id: "anchor", exclusive: true },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export const isRole = (v: string): v is RoleId => ROLES.some((r) => r.id === v);

/**
 * Rifles are for everyone; the two scoped weapons are not.
 *
 * One AWP in a 3v3 retake decides the round on its own, so it is attached to a
 * role that somebody has to claim rather than to whoever set the preference
 * first. The SSG is included for the same reason at half the price — it is the
 * cheap version of the same problem.
 */
export const SNIPER_ONLY_WEAPONS = ["weapon_awp", "weapon_ssg08"] as const;

export const canUseWeapon = (role: RoleId | "", weapon: string): boolean =>
  !(SNIPER_ONLY_WEAPONS as readonly string[]).includes(weapon) || role === "sniper";
