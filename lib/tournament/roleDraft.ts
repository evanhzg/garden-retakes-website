import { prisma } from "@/lib/db";
import { resolveName } from "@/lib/tournament/playerNames";
import { turnSecondsFor } from "@/lib/tournament/edition";
import { isPickupSlug } from "@/lib/tournament/pickup";
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

/**
 * A fresh deadline for the turn about to begin.
 *
 * Takes the slug because a pickup drafts on a ten-second clock and a
 * tournament on a thirty-second one. See turnSecondsFor.
 */
const nextDeadline = (slug: string) =>
  new Date(Date.now() + turnSecondsFor(isPickupSlug(slug)) * 1000);

/**
 * Where carried-forward picks are written, well clear of the draft's own
 * ordinals.
 *
 * Load-bearing beyond tidiness: it is also how `draftSides` recovers, after the
 * fact, which teams were not drafting this match. Nothing else writes an
 * ordinal this high.
 */
const CARRIED_ORDINAL = 1000;

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

  if (members.length === 0) return [];

  // The Steam name, for anybody whose team row has no DisplayName.
  //
  // This used to be `DisplayName ?? SteamId`, which is the same fallback the
  // rest of the site has already been taught not to make — and it is the one
  // that reached the veto board and the match panels, so a player who never set
  // a tournament name watched their own SteamID pick maps. A lobby match sets
  // DisplayName only from what the socket happened to know, which for anybody
  // who has not signed in is nothing, so this is the common case rather than
  // the edge.
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: members.map((m) => m.SteamId) } },
    select: { SteamId: true, LastKnownName: true },
  });

  const known = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName]));

  return members.map((m) => {
    const id = m.SteamId.toString();
    return {
      steamId: id,
      name: resolveName(m.DisplayName, known.get(id), id),
      isCaptain: m.IsCaptain,
      isBot: m.IsBot,
      roleT: m.RoleT,
      roleCt: m.RoleCt,
    };
  });
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
      RolesStartedAt: true,
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

  /**
   * Who is drafting — decided ONCE, when the draft opens, and read back after
   * that rather than recomputed.
   *
   * This is the whole of a bug that made the last pick of a tournament-mode
   * draft impossible. The answer used to come from `rolesComplete`, which reads
   * the team sheet — and the draft WRITES to the team sheet as it goes. So the
   * moment a team's third player picked, that team became "complete", dropped
   * out of the order, and the order was recomputed shorter: ordinals shifted
   * backwards, the final pick was handed an ordinal an earlier pick already
   * held, and the unique index rejected it. The request 500'd, and the board
   * showed the parse failure of an error page rather than anything useful.
   *
   * The frozen answer is recoverable without a new column: a team that was NOT
   * drafting had every one of its players written by carryForwardSettledRoles
   * at CARRIED_ORDINAL, and nothing else ever writes an ordinal that high.
   */
  const perMatch = match.Tournament.RoleMode === "match";

  const carried = match.RolesStartedAt
    ? new Set(
        (
          await prisma.tournamentRolePick.findMany({
            where: { MatchId: matchId, Ordinal: { gte: CARRIED_ORDINAL } },
            select: { SteamId: true },
          })
        ).map((r) => r.SteamId.toString()),
      )
    : new Set<string>();

  const owes = (roster: DraftMember[]): string[] => {
    if (roster.length === 0) return [];

    // Open already: the decision is history, so read it back.
    if (match.RolesStartedAt) {
      return roster.every((m) => carried.has(m.steamId)) ? [] : roster.map((m) => m.steamId);
    }

    // Not open yet: this is where the decision is actually made, and the team
    // sheet is still a safe thing to make it from.
    return perMatch || !rolesComplete(roster) ? roster.map((m) => m.steamId) : [];
  };

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
    select: {
      TeamAId: true,
      TeamBId: true,
      RolesStartedAt: true,
      Tournament: { select: { Slug: true } },
    },
  });

  if (!match?.TeamAId || !match.TeamBId) return false;

  // Opened only once. Two captains readying at the same instant both reach
  // here, and the second must not redraw who picks first.
  if (!match.RolesStartedAt) {
    // Before the clock starts, and deliberately so.
    //
    // A team that keeps its tournament roles gets a row per player here, which
    // does two jobs: the match records what was actually played rather than
    // pointing at a team sheet that may have moved on, and those rows are what
    // `draftSides` reads back afterwards to know who was drafting. Both need
    // this to happen while the team sheet is still the honest source — which is
    // only true until RolesStartedAt is set.
    await carryForwardSettledRoles(matchId);

    const first = Math.random() < 0.5 ? match.TeamAId : match.TeamBId;

    await prisma.tournamentMatch.update({
      where: { Id: matchId },
      data: {
        RolesFirstTeamId: first,
        RolesStartedAt: new Date(),
        RolesDeadline: nextDeadline(match.Tournament.Slug),
        State: "roles",
      },
    });
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
  let ordinal = CARRIED_ORDINAL;

  for (const slot of ["A", "B"] as const) {
    if (sides.drafting[slot].length > 0) continue;

    for (const member of sides.rosters[slot]) {
      if (existing.has(member.steamId)) continue;

      // Upsert, not create. `existing` was read before this loop started, so
      // two requests a moment apart both believed the same players had no pick
      // and both tried to create them — check-then-act, and the second one
      // 500'd. Keyed on the player, which is the only thing that must not be
      // written twice.
      await prisma.tournamentRolePick.upsert({
        where: {
          MatchId_SteamId: { MatchId: matchId, SteamId: BigInt(member.steamId) },
        },
        create: {
          MatchId: matchId,
          Ordinal: ordinal++,
          TeamId: sides.teamIdOf[slot]!,
          SteamId: BigInt(member.steamId),
          RoleT: member.roleT,
          RoleCt: member.roleCt,
          WasAuto: true,
        },
        // A pick that is already there is already right: this only ever carries
        // roles a settled team sheet already holds.
        update: {},
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
  // Looked up here rather than threaded through all three callers. One indexed
  // read against a caller that could forget the argument and silently write a
  // thirty-second clock into a ten-second draft — the deadline has to match the
  // one the board is counting down, or a turn expires while it still says 6s.
  const slug =
    (
      await prisma.tournamentMatch.findUnique({
        where: { Id: matchId },
        select: { Tournament: { select: { Slug: true } } },
      })
    )?.Tournament.Slug ?? "";

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
      data: { RolesDeadline: nextDeadline(slug) },
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
