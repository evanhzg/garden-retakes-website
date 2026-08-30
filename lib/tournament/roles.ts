// The roles a tournament is played with, and the draft that hands them out.
//
// Import-free on purpose, like lib/tournament/veto.ts and edition.ts. Every
// question here has one correct answer given some numbers — whose turn it is,
// which roles are still free, whether a pick is legal — and none of it needs a
// database to say so, which is what makes it testable and what keeps the page,
// the API and the audit trail from disagreeing with each other.
//
// Two things are worth knowing before reading it.
//
// Roles are PER SIDE. A player holds one on T and one on CT, because sides swap
// at halftime and "anchor on T" is not a thing. That is why a turn in the draft
// settles two roles rather than one, and why uniqueness is checked within a
// side rather than across both.
//
// The ids are the plugin's. `awper` is the CT sniper slot and is shown as
// "Sniper" everywhere a person can read it — both sides call the same job by
// the same name now — but the id on the wire stays `awper`, because the plugin
// keys its role kits by id across both sides and cannot hold two called
// `sniper`. The label is the whole of what anybody sees; changing the id would
// be a migration and a plugin release for no visible gain.

export type RoleSide = "T" | "CT";

export type RoleDef = {
  id: string;
  /** What a person reads. */
  label: string;
  /** Only one player a side may hold it. Checked again by the plugin at go-live. */
  unique: boolean;
};

/**
 * The T-side roles, in the order they are offered.
 *
 * `burner` is unique for the same reason `roamer` is, and more literally: it is
 * the only role on the side that can hold a molotov, so two of them is two
 * molotovs and the scarcity the role exists to create is gone. The plugin's
 * RoleKits enforces the same thing, and its loadout keeps fire out of the
 * ordinary T mix so no other role can be handed one by accident.
 */
export const T_ROLES: RoleDef[] = [
  { id: "planter", label: "Planter", unique: true },
  { id: "sniper", label: "Sniper", unique: true },
  { id: "burner", label: "Burner", unique: true },
  { id: "rifler", label: "Rifler", unique: false },
];

/**
 * The CT-side roles, in the order they are offered.
 *
 * `roamer` is unique. It was not, and a side that could field three of them was
 * a side with nobody holding the site — the role is defined by being the one
 * player free to leave the pack, which stops being true the moment there are
 * two. The plugin's RoleKits agrees, so the server refuses exactly what the
 * site refuses.
 */
export const CT_ROLES: RoleDef[] = [
  { id: "roamer", label: "Roamer", unique: true },
  { id: "frontrunner", label: "Front runner", unique: true },
  { id: "awper", label: "Sniper", unique: true },
  { id: "backup", label: "Backup", unique: false },
];

export const rolesFor = (side: RoleSide): RoleDef[] => (side === "T" ? T_ROLES : CT_ROLES);

export const roleDef = (side: RoleSide, id: string | null | undefined): RoleDef | null =>
  rolesFor(side).find((r) => r.id === id) ?? null;

/** What to show for a stored id, whichever side it came from. */
export function roleLabel(id: string | null | undefined): string {
  if (!id) return "";
  return [...T_ROLES, ...CT_ROLES].find((r) => r.id === id)?.label ?? id;
}

/** How long one player has to choose, before it is chosen for them. */
export const ROLE_TURN_SECONDS = 30;

// --------------------------------------------------------------------- draft

export type DraftSlot = "A" | "B";

export type RolePick = {
  ordinal: number;
  steamId: string;
  roleT: string | null;
  roleCt: string | null;
  wasAuto?: boolean;
};

export type DraftTurn = {
  ordinal: number;
  team: DraftSlot;
  steamId: string;
};

export type DraftState = {
  /** Every turn of the draft, in order, whether taken yet or not. */
  order: DraftTurn[];
  /** The turn waiting to be taken, or null when the draft is over. */
  next: DraftTurn | null;
  done: boolean;
  /** Roles already claimed, per team and side, so the board can grey them out. */
  taken: Record<DraftSlot, { T: string[]; CT: string[] }>;
  /**
   * Turns each team has not taken yet, including the one in progress.
   *
   * Carried on the state rather than recomputed by callers because it is what
   * "the last player" means, and the forced-planter rule below is wrong by one
   * if anybody counts it differently.
   */
  left: Record<DraftSlot, number>;
};

/** The T role every side must field. */
export const REQUIRED_T_ROLE = "planter";

/**
 * The order players choose in.
 *
 * A snake, the same shape as a League draft: one, then two at a time, then one.
 * With three a side that is A1, B1, B2, A2, A3, B3.
 *
 * Snaked rather than alternating because the first pick is worth something —
 * there are three T roles for three players, so on a full roster whoever picks
 * last has no choice at all — and a snake is the standard answer to that. Which
 * team goes first is drawn when the draft opens, so the advantage does not
 * follow the bracket's A slot around all evening.
 */
export function draftOrder(rosterA: string[], rosterB: string[]): DraftTurn[] {
  const order: DraftTurn[] = [];
  const rosters: Record<DraftSlot, string[]> = { A: rosterA, B: rosterB };
  const used: Record<DraftSlot, number> = { A: 0, B: 0 };

  let turn: DraftSlot = "A";
  let take = 1;

  // Bounded by the two rosters rather than by a while-true: a bug in the
  // arithmetic below must not spin here, and the total is known exactly.
  const total = rosterA.length + rosterB.length;

  while (order.length < total) {
    const before = order.length;

    for (let i = 0; i < take && used[turn] < rosters[turn].length; i++) {
      order.push({ ordinal: order.length, team: turn, steamId: rosters[turn][used[turn]] });
      used[turn]++;
    }

    turn = turn === "A" ? "B" : "A";
    take = 2;

    // Neither side could move and neither is finished — an impossible state, but
    // one that would loop for ever rather than fail loudly.
    if (order.length === before && used.A >= rosterA.length && used.B >= rosterB.length) {
      break;
    }
  }

  return order;
}

/**
 * Where the draft stands, replayed from the picks.
 *
 * Derived every time rather than kept as mutable state, for the same reason the
 * veto is: the picks are what is stored, so everything reading them agrees.
 */
export function draftState(rosterA: string[], rosterB: string[], picks: RolePick[]): DraftState {
  const order = draftOrder(rosterA, rosterB);
  const byPlayer = new Map(picks.map((p) => [p.steamId, p]));

  const taken: DraftState["taken"] = { A: { T: [], CT: [] }, B: { T: [], CT: [] } };

  for (const turn of order) {
    const pick = byPlayer.get(turn.steamId);
    if (!pick) continue;

    if (pick.roleT) taken[turn.team].T.push(pick.roleT);
    if (pick.roleCt) taken[turn.team].CT.push(pick.roleCt);
  }

  // The first turn nobody has answered. Scanned rather than counted, so a pick
  // written out of order — an organizer filling one player in by hand — does
  // not shift everybody else's turn.
  const next = order.find((turn) => !byPlayer.has(turn.steamId)) ?? null;

  const left: Record<DraftSlot, number> = { A: 0, B: 0 };
  for (const turn of order) {
    if (!byPlayer.has(turn.steamId)) left[turn.team]++;
  }

  return { order, next, done: next === null, taken, left };
}

/**
 * Whether this team has run out of chances to choose a planter.
 *
 * A side without one has nobody carrying the bomb, which is not a worse
 * strategy — it is a round that cannot be played. The plugin falls back to a
 * generalist for an unknown role, and that generalist does not carry a bomb
 * either, so nothing downstream rescues it.
 *
 * Forced on the LAST turn rather than the first: taking the choice away up
 * front would make the role a chore handed to whoever drafts first, when the
 * point of a draft is that a team decides between them. They get every turn but
 * the final one to volunteer.
 */
export const mustTakePlanter = (state: DraftState, team: DraftSlot): boolean =>
  !state.taken[team].T.includes(REQUIRED_T_ROLE) && state.left[team] <= 1;

/**
 * Which roles this team may still take on a side.
 *
 * On a team's last T turn with no planter yet, this is exactly the planter:
 * offering the rest and refusing the click afterwards would be the same rule
 * told twice, the second time as an error.
 */
export function availableRoles(state: DraftState, team: DraftSlot, side: RoleSide): RoleDef[] {
  const claimed = state.taken[team][side];
  const free = rolesFor(side).filter((role) => !role.unique || !claimed.includes(role.id));

  if (side === "T" && mustTakePlanter(state, team)) {
    return free.filter((role) => role.id === REQUIRED_T_ROLE);
  }

  return free;
}

/**
 * Whether a proposed pick is the one the draft is waiting for.
 *
 * Checked server-side even though the board only offers legal roles: two people
 * on the same team clicking at once is normal, and a captain filling in for a
 * player who is also clicking is the case this exists for.
 */
export function validateRolePick(
  rosterA: string[],
  rosterB: string[],
  picks: RolePick[],
  proposed: { steamId: string; roleT: string; roleCt: string },
): { ok: true } | { ok: false; error: string } {
  const state = draftState(rosterA, rosterB, picks);

  if (!state.next) return { ok: false, error: "The role draft is finished." };
  if (state.next.steamId !== proposed.steamId) {
    return { ok: false, error: "It is not that player's turn." };
  }

  const team = state.next.team;
  const sides: [RoleSide, string][] = [
    ["T", proposed.roleT],
    ["CT", proposed.roleCt],
  ];

  for (const [side, wanted] of sides) {
    const def = roleDef(side, wanted);
    if (!def) return { ok: false, error: `'${wanted}' is not a ${side} role.` };

    if (def.unique && state.taken[team][side].includes(def.id)) {
      return { ok: false, error: `${def.label} is already taken on ${side}.` };
    }
  }

  // The last player on a side with no planter has no choice. Checked here as
  // well as hidden from the board, because the board is not the only way in:
  // a captain filling somebody in, or a client that skipped the refresh, would
  // otherwise seat a side that cannot plant the bomb.
  if (mustTakePlanter(state, team) && proposed.roleT !== REQUIRED_T_ROLE) {
    return {
      ok: false,
      error: "Somebody has to carry the bomb — the last pick on a side without a planter is the planter.",
    };
  }

  return { ok: true };
}

/**
 * What to take when a turn runs out.
 *
 * The least surprising legal answer — the first role still free on each side,
 * in the order they are listed — recorded as automatic so nobody has to guess
 * afterwards whether somebody meant it.
 *
 * It needs no rule of its own about the planter: `availableRoles` has already
 * narrowed a last-turn side with no planter to exactly that role, so the first
 * free role IS the planter. One rule, applied wherever roles are offered.
 */
export function autoRolePick(
  rosterA: string[],
  rosterB: string[],
  picks: RolePick[],
): { steamId: string; roleT: string; roleCt: string } | null {
  const state = draftState(rosterA, rosterB, picks);
  if (!state.next) return null;

  const team = state.next.team;
  const t = availableRoles(state, team, "T")[0];
  const ct = availableRoles(state, team, "CT")[0];

  // A roster longer than the unique roles can seat still has the generalist,
  // which is never unique — so this only fails on an empty role list.
  if (!t || !ct) return null;

  return { steamId: state.next.steamId, roleT: t.id, roleCt: ct.id };
}

/**
 * Whether a team already has everything the draft would produce.
 *
 * This is what makes "roles for the whole tournament" work without a second
 * code path: it is the same draft, simply skipped for a team that has already
 * been through one.
 */
export const rolesComplete = (
  members: { roleT: string | null; roleCt: string | null }[],
): boolean => members.length > 0 && members.every((m) => !!m.roleT && !!m.roleCt);

/** Milliseconds left in the current draft turn; 0 once it has run out. */
export function roleTurnRemaining(deadline: Date | null, now: Date): number {
  if (!deadline) return 0;
  return Math.max(0, deadline.getTime() - now.getTime());
}

export const roleTurnExpired = (deadline: Date | null, now: Date): boolean =>
  deadline !== null && roleTurnRemaining(deadline, now) === 0;
