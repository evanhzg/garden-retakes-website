import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  autoStart,
  autoVeto,
  beginRolesOrVeto,
  beginVeto,
  materialiseMaps,
  setMapsDirectly,
} from "@/lib/tournament/vetoRunner";
import { autoRoleDraft } from "@/lib/tournament/roleDraft";
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
  action?:
    | "ready"
    | "unready"
    | "start-veto"
    | "ban"
    | "pick"
    | "side"
    | "admin-auto"
    | "admin-set-maps";
  /** admin-set-maps only: the series, in play order. */
  maps?: { map: string; startSideTeamA?: "T" | "CT" | null }[];
  /** admin-auto only: a map to steer the result towards. */
  preferMap?: string | null;
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

      // Both sides in: the match starts itself, with no admin needed. That is
      // the normal path and the reason ready-up exists at all.
      //
      // What it starts is now the role draft, when there is one to run — the
      // step that decides who plays what, before the maps are argued about.
      if (vetoMayStart(updated.ReadyA, updated.ReadyB, false)) {
        const stage = await beginRolesOrVeto(match.Id);
        return NextResponse.json({ ok: true, started: true, stage });
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
      const stage = await beginRolesOrVeto(match.Id);
      return NextResponse.json({ ok: true, started: true, stage });
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

      // The step that was missing. The veto recorded its actions and computed a
      // state containing the picks, and nothing ever turned those picks into
      // TournamentMatchMap rows — so a correctly completed veto still left
      // startMatch() with no map to play. Idempotent, so calling it on every
      // action rather than trying to detect the last one is free.
      const decided = await materialiseMaps(match.Id);

      // The veto ending and the match starting used to be two acts, the second
      // of which nobody performed — a decided match sat waiting for an organizer
      // to notice.
      //
      // NOT awaited, and that is the fix for a veto that felt broken. startMatch
      // loads the map and then polls `status` until it appears — up to thirty
      // seconds — and all of it used to happen inside this request. So the last
      // ban of a veto hung the captain's browser for half a minute with no
      // indication anything was happening, and every earlier action paid the
      // round trip before its tile would flip.
      //
      // The match page polls, so it discovers the server the moment it exists.
      // Failure is still tolerated exactly as before: the match stays "ready"
      // and startable by hand.
      if (decided.ok) {
        void autoStart(match.Id).catch(() => {
          // Already swallowed inside autoStart; this is belt and braces so an
          // unhandled rejection cannot take the process down.
        });
      }

      return NextResponse.json({ ok: true, done: decided.ok });
    }

    // ---------------------------------------------------------------- admin

    // Decide the whole veto without captains. The organizer's "just get on with
    // it" button, and what a bot match uses: both teams unreachable, or both
    // teams are bots, and the match still has to acquire maps.
    case "admin-auto": {
      if (!isOrganizer) {
        return NextResponse.json({ error: "Organizers only." }, { status: 403 });
      }
      // Roles first. A match decided without captains has nobody to draft
      // either, and starting one whose roles were never settled puts three
      // generalists a side on the server — which is the format the draft exists
      // to replace.
      await autoRoleDraft(match.Id);
      await beginVeto(match.Id);

      const result = await autoVeto(match.Id, Math.random, body.preferMap ?? null);
      if (result.ok) await autoStart(match.Id);
      return NextResponse.json({ ok: result.ok, maps: result.maps });
    }

    // Set the maps by hand. For when the veto has gone wrong, a team cannot be
    // reached, or the maps were agreed somewhere else entirely — all of which
    // happen, and all of which previously meant editing the database.
    case "admin-set-maps": {
      if (!isOrganizer) {
        return NextResponse.json({ error: "Organizers only." }, { status: 403 });
      }
      const result = await setMapsDirectly(match.Id, body.maps ?? []);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await autoStart(match.Id);
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
    wasAuto: v.WasAuto,
  }));

  let state = vetoState(pool, match.BestOf, actions);
  let deadline = match.VetoDeadline;

  if (match.VetoStartedAt && state.next && vetoExpired(deadline, new Date())) {
    const auto = autoAction(pool, match.BestOf, actions);

    if (auto) {
      const teamId = state.next.team === "A" ? match.TeamAId : match.TeamBId;
      await recordAction(match.Id, actions.length, teamId, auto.kind, auto.map, auto.side, true);
      // An expired turn can be the last one, and a veto that completed by
      // timeout needs its maps as much as one that completed by choice.
      const done = await materialiseMaps(match.Id);
      if (done.ok) await autoStart(match.Id);

      actions.push({
        ordinal: actions.length,
        teamId,
        kind: auto.kind,
        map: auto.map,
        side: auto.side,
        // It was: recordAction was just told so. The board shows this, and an
        // auto-pick that looks deliberate is a support conversation nobody can
        // resolve.
        wasAuto: true,
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
    // The audit trail, resolved to slots.
    //
    // The board could only show WHAT had gone, never who took it or in what
    // order — which is exactly the question a veto gets argued about afterwards,
    // and the reason TournamentVetoActions is a table rather than a column. The
    // data was recorded from the start and simply never sent.
    actions: actions.map((a) => ({
      ordinal: a.ordinal,
      team: a.teamId === match.TeamAId ? "A" : a.teamId === match.TeamBId ? "B" : null,
      kind: a.kind,
      map: a.map ?? null,
      side: a.side ?? null,
      wasAuto: a.wasAuto,
    })),
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
