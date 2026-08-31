import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { turnSecondsFor } from "@/lib/tournament/edition";
import { isPickupSlug } from "@/lib/tournament/pickup";
import {
  autoRolePick,
  availableRoles,
  draftState,
  roleTurnExpired,
  validateRolePick,
  CT_ROLES,
  T_ROLES,
} from "@/lib/tournament/roles";
import {
  autoRoleDraft,
  beginRoleDraft,
  closeRoleDraft,
  draftSides,
  picksFor,
  recordRolePick,
} from "@/lib/tournament/roleDraft";
import { beginVeto } from "@/lib/tournament/vetoRunner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The role draft, from the match page.
//
// Deliberately its own route rather than another action on the veto's. They
// share a match and a turn clock in spirit, but not in shape: the veto
// alternates between two captains and this snakes through ten players, and one
// route holding both turn orders would be one route that gets them confused.
//
// The same audiences as the veto, with one addition. A player answers for
// themselves, a captain may answer for anybody on their team — which is the
// normal case, because a captain building a team sheet before everyone has
// logged in is how this is actually used — and an organizer may answer for
// either side.

type Body = {
  key?: string;
  matchId?: number;
  action?: "pick" | "admin-auto" | "admin-skip";
  /** Whose turn is being answered. Defaults to the caller. */
  steamId?: string;
  roleT?: string;
  roleCt?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  if (!body.matchId) return NextResponse.json({ error: "matchId?" }, { status: 400 });

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: body.matchId },
    select: { Id: true, TournamentId: true, TeamAId: true, TeamBId: true, RolesStartedAt: true },
  });

  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  const session = getSession();
  const ctx = await getTournamentContext(body.key);
  const isOrganizer = await canManage(ctx, match.TournamentId);

  const sides = await draftSides(match.Id);
  if (!sides) return NextResponse.json({ error: "No such match." }, { status: 404 });

  switch (body.action) {
    case "admin-auto": {
      if (!isOrganizer) return NextResponse.json({ error: "Organizers only." }, { status: 403 });

      const result = await autoRoleDraft(match.Id);
      if (result.ok) await beginVeto(match.Id);
      return NextResponse.json({ ok: result.ok, picks: result.picks });
    }

    // Leave the roles as they are and get on with the veto. For a tournament
    // that does not care about roles at all, and for the match where one team
    // has walked away from the keyboard.
    case "admin-skip": {
      if (!isOrganizer) return NextResponse.json({ error: "Organizers only." }, { status: 403 });

      await closeRoleDraft(match.Id);
      await beginVeto(match.Id);
      return NextResponse.json({ ok: true });
    }

    case "pick": {
      if (!match.RolesStartedAt) {
        return NextResponse.json({ error: "The role draft has not started." }, { status: 400 });
      }

      const picks = await picksFor(match.Id);
      const state = draftState(sides.drafting.A, sides.drafting.B, picks);

      if (!state.next) {
        return NextResponse.json({ error: "The role draft is finished." }, { status: 400 });
      }

      const turn = state.next;
      const teamId = sides.teamIdOf[turn.team];
      if (!teamId) return NextResponse.json({ error: "That team is missing." }, { status: 400 });

      // Whose turn it is is not negotiable; who may answer for them is.
      const target = body.steamId ?? turn.steamId;
      if (target !== turn.steamId) {
        return NextResponse.json({ error: "It is not that player's turn." }, { status: 400 });
      }

      if (!(await mayAnswerFor(session?.steamId ?? null, isOrganizer, teamId, turn.steamId))) {
        return NextResponse.json(
          { error: "Only that player, their captain or an organizer can pick." },
          { status: 403 },
        );
      }

      const check = validateRolePick(sides.drafting.A, sides.drafting.B, picks, {
        steamId: turn.steamId,
        roleT: body.roleT ?? "",
        roleCt: body.roleCt ?? "",
      });

      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

      await recordRolePick(
        match.Id,
        teamId,
        turn.ordinal,
        turn.steamId,
        body.roleT!,
        body.roleCt!,
        false,
      );

      // The last pick opens the veto. Doing it here rather than making somebody
      // press a button is the same decision the veto made about starting the
      // match: a step nobody performs is a step that does not happen.
      const after = draftState(sides.drafting.A, sides.drafting.B, await picksFor(match.Id));
      if (after.done) {
        await closeRoleDraft(match.Id);
        await beginVeto(match.Id);
      }

      return NextResponse.json({ ok: true, done: after.done });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

/**
 * A turn that ran out picks for itself.
 *
 * GET rather than a background job, exactly as the veto does it: there is no
 * scheduler here and the page polls anyway, so whoever looks first advances it.
 * The deadline is stored, so every viewer agrees on whether it has passed
 * regardless of who asks.
 */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("matchId"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "matchId?" }, { status: 400 });

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: id },
    select: {
      Id: true,
      RolesStartedAt: true,
      RolesDeadline: true,
      RolesFirstTeamId: true,
      Tournament: { select: { Slug: true } },
    },
  });

  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  const sides = await draftSides(id);
  if (!sides) return NextResponse.json({ error: "No such match." }, { status: 404 });

  let picks = await picksFor(id);
  let deadline = match.RolesDeadline;
  let state = draftState(sides.drafting.A, sides.drafting.B, picks);

  if (match.RolesStartedAt && state.next && roleTurnExpired(deadline, new Date())) {
    const auto = autoRolePick(sides.drafting.A, sides.drafting.B, picks);
    const teamId = sides.teamIdOf[state.next.team];

    if (auto && teamId) {
      await recordRolePick(id, teamId, state.next.ordinal, auto.steamId, auto.roleT, auto.roleCt, true);

      picks = await picksFor(id);
      state = draftState(sides.drafting.A, sides.drafting.B, picks);

      // A draft that finished by timeout opens the veto as surely as one that
      // finished by choice.
      if (state.done) {
        await closeRoleDraft(id);
        await beginVeto(id);
        deadline = null;
      } else {
        deadline = new Date(Date.now() + turnSecondsFor(isPickupSlug(match.Tournament.Slug)) * 1000);
        await prisma.tournamentMatch.update({ where: { Id: id }, data: { RolesDeadline: deadline } });
      }
    }
  }

  const pickBySteamId = new Map(picks.map((p) => [p.steamId, p]));

  // Rosters go out with their roles attached, because the same payload draws
  // the side panels — which are on screen throughout the veto and the match,
  // not only during the draft.
  const roster = (slot: "A" | "B") =>
    sides.rosters[slot].map((m) => {
      const pick = pickBySteamId.get(m.steamId);
      return {
        steamId: m.steamId,
        name: m.name,
        isCaptain: m.isCaptain,
        isBot: m.isBot,
        roleT: pick?.roleT ?? m.roleT,
        roleCt: pick?.roleCt ?? m.roleCt,
        picked: pick !== undefined,
        wasAuto: pick?.wasAuto ?? false,
        drafting: sides.drafting[slot].includes(m.steamId),
      };
    });

  return NextResponse.json({
    started: match.RolesStartedAt !== null,
    deadline: deadline?.toISOString() ?? null,
    turnSeconds: turnSecondsFor(isPickupSlug(match.Tournament.Slug)),
    firstTeamId: sides.first,
    teamIdOf: sides.teamIdOf,
    rosters: { A: roster("A"), B: roster("B") },
    // The whole legal set, and what is left for each side, so the board can grey
    // a taken role out rather than hiding it — a role that vanishes reads as a
    // bug, one that is struck through reads as the rule it is.
    roles: { T: T_ROLES, CT: CT_ROLES },
    available: {
      A: { T: availableRoles(state, "A", "T"), CT: availableRoles(state, "A", "CT") },
      B: { T: availableRoles(state, "B", "T"), CT: availableRoles(state, "B", "CT") },
    },
    state: { next: state.next, done: state.done, order: state.order, taken: state.taken },
  });
}

/** Whether this session may answer for that player. */
async function mayAnswerFor(
  mySteamId: string | null,
  isOrganizer: boolean,
  teamId: number,
  targetSteamId: string,
): Promise<boolean> {
  if (isOrganizer) return true;
  if (!mySteamId) return false;
  if (mySteamId === targetSteamId) return true;

  const team = await prisma.tournamentTeam.findFirst({
    where: { Id: teamId, CaptainSteamId: BigInt(mySteamId) },
    select: { Id: true },
  });

  return team !== null;
}
