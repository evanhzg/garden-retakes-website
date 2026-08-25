import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { AdminLevel } from "@/lib/adminImmunity";
import { roundRobin, singleElimination, resolveByes, type PlannedMatch } from "@/lib/tournament/bracket";
import { startMatch } from "@/lib/tournament/matchRunner";
import { execOnServer } from "@/lib/tournament/servers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Running a tournament from the admin side.
//
// One route with an action rather than six, because every one of them needs the
// same admin gate and the same audit line, and six copies of that is how one of
// them ends up missing it.

type Body = {
  key?: string;
  action?: "create" | "add-stage" | "generate" | "start" | "set-pool" | "state" | "admin";
  tournamentId?: number;
  stageId?: number;
  matchId?: number;
  // create
  name?: string;
  slug?: string;
  teamSize?: number;
  // add-stage
  stageName?: string;
  kind?: "group" | "swiss" | "single" | "double";
  bestOf?: number;
  finalBestOf?: number;
  // set-pool
  maps?: string[];
  // state
  state?: string;
  // admin passthrough
  command?: string;
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const ctx = await getAdminContext(body.key);
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  switch (body.action) {
    case "create": {
      const name = (body.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

      const slug = slugify(body.slug || name);
      if (!slug) return NextResponse.json({ error: "That name has no usable slug." }, { status: 400 });

      const tournament = await prisma.tournament.create({
        data: {
          Name: name,
          Slug: slug,
          TeamSize: body.teamSize ?? 3,
          State: "registration",
          OwnerSteamId: ctx.steamId ? BigInt(ctx.steamId) : null,
        },
      });

      await logAdminAction(ctx, "tournament.create", undefined, slug);
      return NextResponse.json({ ok: true, id: tournament.Id, slug });
    }

    case "add-stage": {
      if (!body.tournamentId) return NextResponse.json({ error: "tournamentId?" }, { status: 400 });

      const count = await prisma.tournamentStage.count({
        where: { TournamentId: body.tournamentId },
      });

      const stage = await prisma.tournamentStage.create({
        data: {
          TournamentId: body.tournamentId,
          Name: (body.stageName ?? `Stage ${count + 1}`).slice(0, 64),
          Kind: body.kind ?? "single",
          Ordinal: count,
          BestOf: body.bestOf ?? 1,
          FinalBestOf: body.finalBestOf ?? null,
        },
      });

      await logAdminAction(ctx, "tournament.stage", undefined, stage.Name);
      return NextResponse.json({ ok: true, id: stage.Id });
    }

    case "set-pool": {
      if (!body.tournamentId) return NextResponse.json({ error: "tournamentId?" }, { status: 400 });

      const maps = (body.maps ?? []).map((m) => m.trim()).filter(Boolean).slice(0, 32);

      await prisma.$transaction([
        prisma.tournamentMap.deleteMany({ where: { TournamentId: body.tournamentId } }),
        prisma.tournamentMap.createMany({
          data: maps.map((map, i) => ({ TournamentId: body.tournamentId!, Map: map, Ordinal: i })),
        }),
      ]);

      await logAdminAction(ctx, "tournament.pool", undefined, maps.join(","));
      return NextResponse.json({ ok: true, maps });
    }

    case "generate":
      return generate(body, ctx);

    case "state": {
      if (!body.tournamentId || !body.state) {
        return NextResponse.json({ error: "tournamentId and state?" }, { status: 400 });
      }

      await prisma.tournament.update({
        where: { Id: body.tournamentId },
        data: { State: body.state.slice(0, 16) },
      });

      await logAdminAction(ctx, "tournament.state", undefined, body.state);
      return NextResponse.json({ ok: true });
    }

    case "start": {
      if (!body.matchId) return NextResponse.json({ error: "matchId?" }, { status: 400 });

      const result = await startMatch(body.matchId);
      await logAdminAction(ctx, "tournament.start", undefined, `match ${body.matchId}`);

      return NextResponse.json(result);
    }

    case "admin": {
      // Passes an admin command through to whichever server a match is on. This
      // is what makes the per-match panel work without a second command surface
      // to keep in step with the plugin's.
      if (!body.matchId || !body.command) {
        return NextResponse.json({ error: "matchId and command?" }, { status: 400 });
      }

      const match = await prisma.tournamentMatch.findUnique({ where: { Id: body.matchId } });
      if (!match?.ServerId) {
        return NextResponse.json({ error: "That match is not on a server." }, { status: 400 });
      }

      const reply = await execOnServer(match.ServerId, body.command);
      await logAdminAction(ctx, "tournament.rcon", undefined, body.command.slice(0, 250));

      return NextResponse.json({ ok: true, reply });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

/**
 * Builds a stage's matches.
 *
 * Refuses when the stage already has any, rather than adding to them. Generating
 * twice would double a bracket in a way that is very hard to see and impossible
 * to play, and "delete them first" is a decision an admin should make
 * deliberately.
 */
async function generate(body: Body, ctx: Awaited<ReturnType<typeof getAdminContext>>) {
  if (!body.stageId) return NextResponse.json({ error: "stageId?" }, { status: 400 });

  const stage = await prisma.tournamentStage.findUnique({
    where: { Id: body.stageId },
    include: { Tournament: { include: { Teams: true } } },
  });

  if (!stage) return NextResponse.json({ error: "No such stage." }, { status: 404 });

  const existing = await prisma.tournamentMatch.count({ where: { StageId: stage.Id } });
  if (existing > 0) {
    return NextResponse.json(
      { error: `That stage already has ${existing} matches. Delete them first.` },
      { status: 400 },
    );
  }

  const teams = stage.Tournament.Teams
    .filter((t) => t.Status === "accepted")
    .map((t, i) => ({ id: t.Id, seed: t.Seed ?? i + 1, name: t.Name }));

  if (teams.length < 2) {
    return NextResponse.json({ error: "At least two accepted teams are needed." }, { status: 400 });
  }

  const planned: PlannedMatch[] =
    stage.Kind === "group" || stage.Kind === "swiss"
      ? roundRobin(teams, stage.BestOf)
      : resolveByes(singleElimination(teams, stage.BestOf, stage.FinalBestOf ?? undefined));

  // Written in two passes: the rows first to get their ids, then the pointers,
  // because a match cannot reference one that does not exist yet.
  const created = await prisma.$transaction(
    planned.map((m) =>
      prisma.tournamentMatch.create({
        data: {
          TournamentId: stage.TournamentId,
          StageId: stage.Id,
          MatchKey: `t${stage.TournamentId}s${stage.Id}r${m.round}m${m.slot}`,
          Round: m.round,
          Slot: m.slot,
          BestOf: m.bestOf,
          TeamAId: m.teamAId,
          TeamBId: m.teamBId,
          State: m.isBye ? "finished" : "pending",
          WinnerTeamId: m.isBye ? m.teamAId ?? m.teamBId : null,
        },
      }),
    ),
  );

  const idByRef = new Map(planned.map((m, i) => [m.ref, created[i].Id]));

  await prisma.$transaction(
    planned
      .filter((m) => m.nextRef !== null || m.loserNextRef !== null)
      .map((m) =>
        prisma.tournamentMatch.update({
          where: { Id: idByRef.get(m.ref)! },
          data: {
            NextMatchId: m.nextRef !== null ? idByRef.get(m.nextRef) ?? null : null,
            NextSlot: m.nextSlot,
            LoserNextMatchId: m.loserNextRef !== null ? idByRef.get(m.loserNextRef) ?? null : null,
            LoserNextSlot: m.loserNextSlot,
          },
        }),
      ),
  );

  await prisma.tournamentStage.update({ where: { Id: stage.Id }, data: { State: "live" } });
  await logAdminAction(ctx, "tournament.generate", undefined, `${stage.Name}: ${planned.length} matches`);

  return NextResponse.json({ ok: true, matches: planned.length });
}
