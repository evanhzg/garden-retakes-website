import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { autoAction, validateAction, vetoState } from "@/lib/tournament/veto";
import { VETO_TURN_SECONDS, vetoExpired, vetoMayStart } from "@/lib/tournament/edition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Ready-up and the veto, from the match page.
//
// Two audiences with different rights on the same object: captains ready their
// own team and ban on their own turn, organizers can force either. Both go
// through here so the turn clock has one owner — a countdown enforced in two
// places is a countdown that disagrees with itself.

type Body = {
  key?: string;
  matchId?: number;
  action?: "ready" | "unready" | "start-veto" | "ban" | "pick" | "side";
  map?: string;
  side?: "T" | "CT";
};

/** A fresh deadline for the turn that is about to begin. */
const nextDeadline = () => new Date(Date.now() + VETO_TURN_SECONDS * 1000);

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
    include: {
      Tournament: { include: { Maps: { orderBy: { Ordinal: "asc" } } } },
      Veto: { orderBy: { Ordinal: "asc" } },
    },
  });

  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  const session = getSession();
  const ctx = await getTournamentContext(body.key);
  const isOrganizer = await canManage(ctx, match.TournamentId);

  // Which side, if any, this person captains. Null for a spectator, an
  // organizer who is not playing, or a player on another match.
  const mySlot = await slotOf(session?.steamId ?? null, match.TeamAId, match.TeamBId);

  if (!isOrganizer && mySlot === null) {
    return NextResponse.json(
      { error: "Only the two captains and the organizers can do that." },
      { status: 403 },
    );
  }

  const pool = match.Tournament.Maps.map((m) => m.Map);

  switch (body.action) {
    case "ready":
    case "unready": {
      if (match.VetoStartedAt) {
        return NextResponse.json({ error: "The veto has already started." }, { status: 400 });
      }

      const value = body.action === "ready";

      // An organizer readying acts for nobody in particular, so they must say
      // which side — done by being that side's captain, or by forcing the veto
      // outright, which is the button they actually have.
      if (mySlot === null) {
        return NextResponse.json(
          { error: "Use Start veto — you are not on either team." },
          { status: 400 },
        );
      }

      const updated = await prisma.tournamentMatch.update({
        where: { Id: match.Id },
        data: mySlot === "A" ? { ReadyA: value } : { ReadyB: value },
      });

      // Both sides in: the veto starts itself, with no admin needed. That is
      // the normal path and the reason ready-up exists at all.
      if (vetoMayStart(updated.ReadyA, updated.ReadyB, false)) {
        await beginVeto(match.Id);
        return NextResponse.json({ ok: true, started: true });
      }

      return NextResponse.json({ ok: true, started: false });
    }

    case "start-veto": {
      if (!isOrganizer) {
        return NextResponse.json({ error: "Organizers only." }, { status: 403 });
      }
      if (match.VetoStartedAt) {
        return NextResponse.json({ error: "The veto has already started." }, { status: 400 });
      }

      // The escape hatch for the team that is on the server but not on the
      // website, which at a real event is most of them.
      await beginVeto(match.Id);
      return NextResponse.json({ ok: true, started: true });
    }

    case "ban":
    case "pick":
    case "side": {
      if (!match.VetoStartedAt) {
        return NextResponse.json({ error: "The veto has not started." }, { status: 400 });
      }

      const actions = match.Veto.map((v) => ({
        ordinal: v.Ordinal,
        teamId: v.TeamId,
        kind: v.Kind as "ban" | "pick" | "side",
        map: v.Map ?? undefined,
        side: (v.Side as "T" | "CT" | undefined) ?? undefined,
      }));

      const state = vetoState(pool, match.BestOf, actions);
      if (!state.next) return NextResponse.json({ error: "The veto is finished." }, { status: 400 });

      // Whose turn it is, as a slot rather than a team id, because that is what
      // the sequence is expressed in.
      const turnSlot = state.next.team;
      const actingSlot = isOrganizer && mySlot === null ? turnSlot : mySlot;

      if (actingSlot !== turnSlot) {
        return NextResponse.json({ error: "It is not your turn." }, { status: 400 });
      }

      const teamId = turnSlot === "A" ? match.TeamAId : match.TeamBId;

      const check = validateAction(pool, match.BestOf, actions, {
        team: turnSlot,
        kind: body.action,
        map: body.map,
        side: body.side,
      });

      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

      await recordAction(match.Id, actions.length, teamId, body.action, body.map, body.side, false);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

/**
 * A turn that ran out picks for itself.
 *
 * GET rather than a background job: there is no scheduler here, and the page
 * polls anyway. Whoever looks first advances it, which is enough — the deadline
 * is stored, so every viewer agrees on whether it has passed regardless of who
 * asks.
 */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("matchId"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "matchId?" }, { status: 400 });

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: id },
    include: {
      Tournament: { include: { Maps: { orderBy: { Ordinal: "asc" } } } },
      Veto: { orderBy: { Ordinal: "asc" } },
    },
  });

  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  const pool = match.Tournament.Maps.map((m) => m.Map);
  const actions = match.Veto.map((v) => ({
    ordinal: v.Ordinal,
    teamId: v.TeamId,
    kind: v.Kind as "ban" | "pick" | "side",
    map: v.Map ?? undefined,
    side: (v.Side as "T" | "CT" | undefined) ?? undefined,
  }));

  let state = vetoState(pool, match.BestOf, actions);
  let deadline = match.VetoDeadline;

  if (match.VetoStartedAt && state.next && vetoExpired(deadline, new Date())) {
    const auto = autoAction(pool, match.BestOf, actions);

    if (auto) {
      const teamId = state.next.team === "A" ? match.TeamAId : match.TeamBId;
      await recordAction(match.Id, actions.length, teamId, auto.kind, auto.map, auto.side, true);

      actions.push({
        ordinal: actions.length,
        teamId,
        kind: auto.kind,
        map: auto.map,
        side: auto.side,
      });

      state = vetoState(pool, match.BestOf, actions);
      deadline = state.next ? nextDeadline() : null;

      await prisma.tournamentMatch.update({
        where: { Id: match.Id },
        data: { VetoDeadline: deadline },
      });
    }
  }

  return NextResponse.json({
    started: match.VetoStartedAt !== null,
    readyA: match.ReadyA,
    readyB: match.ReadyB,
    deadline: deadline?.toISOString() ?? null,
    turnSeconds: VETO_TURN_SECONDS,
    pool,
    state,
  });
}

async function beginVeto(matchId: number) {
  await prisma.tournamentMatch.update({
    where: { Id: matchId },
    data: { VetoStartedAt: new Date(), VetoDeadline: nextDeadline(), State: "veto" },
  });
}

async function recordAction(
  matchId: number,
  ordinal: number,
  teamId: number | null,
  kind: string,
  map: string | undefined,
  side: string | undefined,
  wasAuto: boolean,
) {
  await prisma.$transaction([
    prisma.tournamentVetoAction.create({
      data: {
        MatchId: matchId,
        Ordinal: ordinal,
        TeamId: teamId,
        Kind: kind,
        Map: map ?? null,
        Side: side ?? null,
        WasAuto: wasAuto,
      },
    }),
    // Every accepted action starts the next turn's clock. Done in the same
    // transaction so a turn can never exist without a deadline.
    prisma.tournamentMatch.update({
      where: { Id: matchId },
      data: { VetoDeadline: nextDeadline() },
    }),
  ]);
}

/** Which side this SteamID captains in this match, if either. */
async function slotOf(
  steamId: string | null,
  teamAId: number | null,
  teamBId: number | null,
): Promise<"A" | "B" | null> {
  if (!steamId) return null;

  const ids = [teamAId, teamBId].filter((x): x is number => x !== null);
  if (ids.length === 0) return null;

  const team = await prisma.tournamentTeam.findFirst({
    where: { Id: { in: ids }, CaptainSteamId: BigInt(steamId) },
  });

  if (!team) return null;
  return team.Id === teamAId ? "A" : "B";
}
