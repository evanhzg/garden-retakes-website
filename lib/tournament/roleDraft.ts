import { prisma } from "@/lib/db";
import {
  ROLE_TURN_SECONDS,
  autoRolePick,
  draftState,
  rolesComplete,
  type DraftSlot,
  type RolePick,
} from "@/lib/tournament/roles";

// Running the role draft: the step between ready-up and the veto.
//
// The arithmetic is all in lib/tournament/roles.ts, which has no imports and is
// where the turn order and the uniqueness rules are tested. This is the half
// that talks to the database — whose roster is whose, what has been picked, and
// what to write when the draft finishes.
//
// The draft exists because roles used to be a registration form nobody filled
// in. A team sheet with three empty roles plays three generalists, which is not
// a format so much as the absence of one; and the plugin was already refusing
// duplicate unique roles at go-live, so the only question was where the
// conflict got caught. Catching it here means it is caught while somebody can
// still do something about it.

/** A fresh deadline for the turn about to begin. */
const nextDeadline = () => new Date(Date.now() + ROLE_TURN_SECONDS * 1000);

export type DraftMember = {
  steamId: string;
  name: string;
  isCaptain: boolean;
  isBot: boolean;
  roleT: string | null;
  roleCt: string | null;
};

/**
 * A team's playing roster, in draft order.
 *
 * Captain first, then by row id. That ordering is the whole of what "player A1"
 * means: the captain picks first for their team, which is the only ordering
 * anybody would guess and the only one that stays stable as members are added.
 */
export async function draftRoster(teamId: number | null): Promise<DraftMember[]> {
  if (!teamId) return [];

  const members = await prisma.tournamentTeamMember.findMany({
    where: { TeamId: teamId, Status: "accepted" },
    orderBy: [{ IsCaptain: "desc" }, { Id: "asc" }],
  });

  return members.map((m) => ({
    steamId: m.SteamId.toString(),
    name: m.DisplayName ?? m.SteamId.toString(),
    isCaptain: m.IsCaptain,
    isBot: m.IsBot,
    roleT: m.RoleT,
    roleCt: m.RoleCt,
  }));
}

export async function picksFor(matchId: number): Promise<RolePick[]> {
  const rows = await prisma.tournamentRolePick.findMany({
    where: { MatchId: matchId },
    orderBy: { Ordinal: "asc" },
  });

  return rows.map((r) => ({
    ordinal: r.Ordinal,
    steamId: r.SteamId.toString(),
    roleT: r.RoleT,
    roleCt: r.RoleCt,
    wasAuto: r.WasAuto,
  }));
}

/**
 * The two rosters as the draft sees them: "A" picks first.
 *
 * Which of the bracket's two teams that is was drawn when the draft opened and
 * lives in RolesFirstTeamId, so the same match always resolves the same way
 * however many times this is called.
 */
export async function draftSides(matchId: number): Promise<{
  first: number | null;
  teamAId: number | null;
  teamBId: number | null;
  /** Rosters keyed by draft slot rather than by bracket slot. */
  rosters: Record<DraftSlot, DraftMember[]>;
  /** Which bracket team each draft slot is. */
  teamIdOf: Record<DraftSlot, number | null>;
  /** Only the players who still owe a pick, per draft slot. */
  drafting: Record<DraftSlot, string[]>;
} | null> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: {
      TeamAId: true,
      TeamBId: true,
      RolesFirstTeamId: true,
      Tournament: { select: { RoleMode: true } },
    },
  });

  if (!match) return null;

  const first = match.RolesFirstTeamId ?? match.TeamAId;
  const second = first === match.TeamAId ? match.TeamBId : match.TeamAId;

  const [rosterFirst, rosterSecond] = await Promise.all([
    draftRoster(first),
    draftRoster(second),
  ]);

  // In tournament mode a team that has already drafted does not draft again, so
  // its players are simply absent from the order. That is the entire difference
  // between the two modes — there is no second code path.
  const perMatch = match.Tournament.RoleMode === "match";
  const owes = (roster: DraftMember[]) =>
    perMatch || !rolesComplete(roster) ? roster.map((m) => m.steamId) : [];

  return {
    first,
    teamAId: match.TeamAId,
    teamBId: match.TeamBId,
    rosters: { A: rosterFirst, B: rosterSecond },
    teamIdOf: { A: first, B: second },
    drafting: { A: owes(rosterFirst), B: owes(rosterSecond) },
  };
}

/**
 * Whether anybody still owes a pick.
 *
 * Asked as "is there a turn outstanding", not "was there ever anything to
 * draft" — and that distinction is the whole of it. The first version asked the
 * second question, so a draft that had ALREADY FINISHED still answered yes, and
 * a caller re-entering the flow was told the match was mid-draft for ever
 * instead of being sent on to the veto. It only ever happened on a re-entry —
 * a captain pressing ready twice, an organizer forcing a start on a match whose
 * draft had auto-completed — which is exactly the kind of path that gets found
 * at an event rather than in review.
 *
 * False for a match missing a team, and false for a tournament that drafts once
 * where both teams have already been through it: the draft is over before it
 * starts, and the caller goes straight to the veto.
 */
export async function roleDraftOutstanding(matchId: number): Promise<boolean> {
  const sides = await draftSides(matchId);
  if (!sides) return false;
  if (sides.drafting.A.length + sides.drafting.B.length === 0) return false;

  const state = draftState(sides.drafting.A, sides.drafting.B, await picksFor(matchId));
  return state.next !== null;
}

/**
 * Opens the draft: draws who picks first and starts the clock.
 *
 * The draw is the only thing here that cannot be recomputed, which is why it is
 * written down. Everything else about the draft — the order, whose turn it is,
 * what is still free — is derived from the picks and the rosters every time it
 * is asked for.
 *
 * Returns false when there was nothing to draft, so the caller can move
 * straight on to the veto rather than showing an empty board.
 */
export async function beginRoleDraft(matchId: number): Promise<boolean> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { TeamAId: true, TeamBId: true, RolesStartedAt: true },
  });

  if (!match?.TeamAId || !match.TeamBId) return false;

  // Opened only once. Two captains readying at the same instant both reach
  // here, and the second must not redraw who picks first.
  if (!match.RolesStartedAt) {
    const first = Math.random() < 0.5 ? match.TeamAId : match.TeamBId;

    await prisma.tournamentMatch.update({
      where: { Id: matchId },
      data: {
        RolesFirstTeamId: first,
        RolesStartedAt: new Date(),
        RolesDeadline: nextDeadline(),
        State: "roles",
      },
    });

    // A team that keeps its tournament roles still gets a row per player, so
    // the match records what was actually played rather than pointing at a team
    // sheet that may have moved on by the time anybody reads it.
    await carryForwardSettledRoles(matchId);
  }

  // Asked whether the draft was opened a moment ago or ten minutes ago, so this
  // function gives the same answer however many times it is called. Returning
  // "still drafting" for a draft that had finished was a match that never
  // reached its veto.
  if (await roleDraftOutstanding(matchId)) return true;

  await closeRoleDraft(matchId);
  return false;
}

/** Copies a team's existing roles into this match's record, for teams not drafting. */
async function carryForwardSettledRoles(matchId: number): Promise<void> {
  const sides = await draftSides(matchId);
  if (!sides) return;

  const existing = new Set((await picksFor(matchId)).map((p) => p.steamId));
  let ordinal = 1000; // Well clear of the draft's own ordinals.

  for (const slot of ["A", "B"] as const) {
    if (sides.drafting[slot].length > 0) continue;

    for (const member of sides.rosters[slot]) {
      if (existing.has(member.steamId)) continue;

      await prisma.tournamentRolePick.create({
        data: {
          MatchId: matchId,
          Ordinal: ordinal++,
          TeamId: sides.teamIdOf[slot]!,
          SteamId: BigInt(member.steamId),
          RoleT: member.roleT,
          RoleCt: member.roleCt,
          WasAuto: true,
        },
      });
    }
  }
}

/**
 * Writes one pick, and starts the next turn's clock in the same transaction so
 * a turn can never exist without a deadline.
 */
export async function recordRolePick(
  matchId: number,
  teamId: number,
  ordinal: number,
  steamId: string,
  roleT: string,
  roleCt: string,
  wasAuto: boolean,
): Promise<void> {
  await prisma.$transaction([
    prisma.tournamentRolePick.upsert({
      where: { MatchId_SteamId: { MatchId: matchId, SteamId: BigInt(steamId) } },
      create: {
        MatchId: matchId,
        Ordinal: ordinal,
        TeamId: teamId,
        SteamId: BigInt(steamId),
        RoleT: roleT,
        RoleCt: roleCt,
        WasAuto: wasAuto,
      },
      update: { RoleT: roleT, RoleCt: roleCt, WasAuto: wasAuto },
    }),
    prisma.tournamentMatch.update({
      where: { Id: matchId },
      data: { RolesDeadline: nextDeadline() },
    }),
  ]);

  // The team sheet follows the draft. In tournament mode this is what every
  // later match reads; in match mode it is a sensible default for the next one.
  await prisma.tournamentTeamMember.updateMany({
    where: { TeamId: teamId, SteamId: BigInt(steamId) },
    data: { RoleT: roleT, RoleCt: roleCt },
  });
}

/** Shuts the draft down and hands the match to the veto. */
export async function closeRoleDraft(matchId: number): Promise<void> {
  await prisma.tournamentMatch.update({
    where: { Id: matchId },
    data: { RolesDeadline: null },
  });
}

/**
 * Plays the draft out without anybody.
 *
 * Used for bot matches and as the organizer's "just decide it" button. Reuses
 * autoRolePick — the same function a run-out clock uses — so an auto-drafted
 * match is indistinguishable from one where everybody timed out, rather than
 * being a third idea of what a legal draft is.
 */
export async function autoRoleDraft(matchId: number): Promise<{ ok: boolean; picks: number }> {
  const sides = await draftSides(matchId);
  if (!sides) return { ok: false, picks: 0 };

  let picks = await picksFor(matchId);
  let made = 0;

  // Bounded by the two rosters: a bug in the order must not spin here.
  const cap = sides.drafting.A.length + sides.drafting.B.length + 2;

  while (made < cap) {
    const state = draftState(sides.drafting.A, sides.drafting.B, picks);
    if (state.done || !state.next) break;

    const auto = autoRolePick(sides.drafting.A, sides.drafting.B, picks);
    if (!auto) break;

    const teamId = sides.teamIdOf[state.next.team];
    if (!teamId) break;

    await recordRolePick(
      matchId,
      teamId,
      state.next.ordinal,
      auto.steamId,
      auto.roleT,
      auto.roleCt,
      true,
    );

    picks = [
      ...picks,
      { ordinal: state.next.ordinal, steamId: auto.steamId, roleT: auto.roleT, roleCt: auto.roleCt, wasAuto: true },
    ];
    made++;
  }

  await closeRoleDraft(matchId);
  return { ok: true, picks: made };
}

/**
 * The roles this match is actually played with.
 *
 * The match's own picks first, the team sheet second. The order matters for a
 * finished match: a team that redrafts every round would otherwise have its
 * old matches re-read with its newest roles, which is a scoreboard that changes
 * after the fact.
 */
export async function rolesForMatch(
  matchId: number,
): Promise<Map<string, { roleT: string | null; roleCt: string | null }>> {
  const out = new Map<string, { roleT: string | null; roleCt: string | null }>();

  for (const pick of await picksFor(matchId)) {
    out.set(pick.steamId, { roleT: pick.roleT, roleCt: pick.roleCt });
  }

  return out;
}
