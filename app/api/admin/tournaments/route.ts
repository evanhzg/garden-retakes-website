import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/adminAuth";
import { canManage, getTournamentContext, type TournamentContext } from "@/lib/tournamentAuth";
import { roundRobin, singleElimination, resolveByes, type PlannedMatch } from "@/lib/tournament/bracket";
import { forceEndMatch, restartMatch, startMatch } from "@/lib/tournament/matchRunner";
import { parseBackups, parseRoundDetail } from "@/lib/tournament/backups";
import { execOnServer } from "@/lib/tournament/servers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Running a tournament from the admin side.
//
// One route with an action rather than six, because every one of them needs the
// same gate and the same audit line, and six copies of that is how one of them
// ends up missing it.
//
// The gate is no longer one level test. Creating needs standing (an organizer,
// or an admin); everything else needs standing ON THE TOURNAMENT BEING EDITED,
// which for an organizer means their own and for an admin means any. Actions
// name their subject in different ways — a stage id, a match id — so the
// tournament is resolved from whichever one arrived before the gate runs.

type Body = {
  key?: string;
  action?:
    | "create"
    | "add-stage"
    | "generate"
    | "start"
    | "set-pool"
    | "state"
    | "admin"
    | "end"
    | "restart"
    | "backups"
    | "roundinfo"
    | "adminlog"
    | "add-organizer"
    | "remove-organizer";
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
  // end
  winner?: "a" | "b";
  // roundinfo
  round?: number;
  // add-organizer / remove-organizer
  steamId?: string;
  organizerName?: string;
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);

/**
 * Which tournament an action is about, however it named its subject.
 *
 * Every action except `create` edits exactly one tournament, but three of them
 * arrive holding a stage or a match instead. Resolving that here means the gate
 * below is one line rather than a per-action lookup somebody forgets to add.
 */
async function subjectOf(body: Body): Promise<number | null> {
  if (body.tournamentId) return body.tournamentId;

  if (body.stageId) {
    const stage = await prisma.tournamentStage.findUnique({
      where: { Id: body.stageId },
      select: { TournamentId: true },
    });
    return stage?.TournamentId ?? null;
  }

  if (body.matchId) {
    const match = await prisma.tournamentMatch.findUnique({
      where: { Id: body.matchId },
      select: { TournamentId: true },
    });
    return match?.TournamentId ?? null;
  }

  return null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const ctx = await getTournamentContext(body.key);

  if (body.action === "create") {
    if (!ctx.canCreate) {
      return NextResponse.json(
        { error: "Only organizers and admins can create a tournament." },
        { status: 403 },
      );
    }
  } else {
    const subject = await subjectOf(body);
    if (subject === null) {
      return NextResponse.json({ error: "Which tournament?" }, { status: 400 });
    }
    if (!(await canManage(ctx, subject))) {
      return NextResponse.json({ error: "You do not run this tournament." }, { status: 403 });
    }
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

      // The creator goes on the organizer list immediately. Without this an
      // organizer would create a tournament and instantly lose access to it,
      // since the gate reads the list rather than OwnerSteamId. A key-authorized
      // creator has no SteamID to record, and needs none — the key manages
      // everything anyway.
      if (ctx.steamId) {
        await prisma.tournamentOrganizer.create({
          data: {
            TournamentId: tournament.Id,
            SteamId: BigInt(ctx.steamId),
            Name: ctx.name?.slice(0, 64) || null,
            IsCreator: true,
          },
        });
      }

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
      // The match id goes in the detail, so the per-match history can find it.
      // Without it an rcon line is an orphan: "css_score 7 4" with no way to
      // tell which of six live matches it was aimed at.
      await logAdminAction(
        ctx,
        "tournament.rcon",
        undefined,
        `match ${body.matchId}: ${body.command}`.slice(0, 250),
      );

      return NextResponse.json({ ok: true, reply });
    }

    case "end": {
      // Force-ending is NOT the rcon passthrough. css_endmatch needs the plugin
      // to be holding a live match, and the case an admin most needs this in is
      // exactly the one where it is not — a restarted game server answers "no
      // match is live" and the website is left showing a match that can never
      // be ended from anywhere. So the database ends it and the server is told
      // afterwards.
      if (!body.matchId || (body.winner !== "a" && body.winner !== "b")) {
        return NextResponse.json({ error: "matchId and winner (a|b)?" }, { status: 400 });
      }

      const result = await forceEndMatch(body.matchId, body.winner);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

      await logAdminAction(ctx, "tournament.end", undefined, `match ${body.matchId} to ${body.winner}`);
      return NextResponse.json(result);
    }

    case "restart": {
      if (!body.matchId) return NextResponse.json({ error: "matchId?" }, { status: 400 });

      const result = await restartMatch(body.matchId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

      // The server is told too, so a box still holding the old match drops it
      // rather than reporting rounds into a match the website has just reset.
      // Best effort for the same reason as above.
      const m = await prisma.tournamentMatch.findUnique({ where: { Id: body.matchId } });
      if (m?.ServerId) {
        try {
          await execOnServer(m.ServerId, "css_restartmatch");
        } catch {
          // A server that cannot be reached is one the restart did not need.
        }
      }

      await logAdminAction(ctx, "tournament.restart", undefined, `match ${body.matchId}`);
      return NextResponse.json({ ok: true });
    }

    case "backups": {
      // What can be restored, and what each one holds. Read live off the server
      // because the files are on its disk and nothing else knows about them.
      if (!body.matchId) return NextResponse.json({ error: "matchId?" }, { status: 400 });

      const m = await prisma.tournamentMatch.findUnique({ where: { Id: body.matchId } });
      if (!m?.ServerId) return NextResponse.json({ ok: true, backups: [] });

      try {
        const reply = await execOnServer(m.ServerId, "css_backups");
        return NextResponse.json({ ok: true, backups: parseBackups(reply) });
      } catch {
        return NextResponse.json({ ok: true, backups: [] });
      }
    }

    case "roundinfo": {
      if (!body.matchId || !body.round) {
        return NextResponse.json({ error: "matchId and round?" }, { status: 400 });
      }

      const m = await prisma.tournamentMatch.findUnique({ where: { Id: body.matchId } });
      if (!m?.ServerId) return NextResponse.json({ ok: true, detail: null });

      try {
        const reply = await execOnServer(m.ServerId, `css_roundinfo ${Number(body.round)}`);
        return NextResponse.json({ ok: true, detail: parseRoundDetail(reply) });
      } catch {
        return NextResponse.json({ ok: true, detail: null });
      }
    }

    case "adminlog": {
      // Every admin action taken on this match.
      //
      // The log has no MatchId column — it is the site-wide audit trail — so the
      // match is named in the detail and matched exactly here. `contains` alone
      // would put match 17's history in front of match 1, and the SQL LIKE is
      // only there to keep the row count down before the exact test runs.
      if (!body.matchId) return NextResponse.json({ error: "matchId?" }, { status: 400 });

      const id = body.matchId;

      const rows = await prisma.gardenAdminLogEntry.findMany({
        where: { Action: { startsWith: "tournament." }, Detail: { contains: `match ${id}` } },
        orderBy: { AtUtc: "desc" },
        take: 200,
      });

      const exact = new RegExp(`\\bmatch ${id}\\b`);

      return NextResponse.json({
        ok: true,
        entries: rows
          .filter((r) => exact.test(r.Detail))
          .map((r) => ({
            at: r.AtUtc.toISOString(),
            actor: r.ActorName,
            action: r.Action.replace(/^tournament\./, ""),
            detail: r.Detail.replace(exact, "").replace(/^[:\s]+/, "").trim(),
          })),
      });
    }

    case "add-organizer": {
      if (!body.tournamentId) return NextResponse.json({ error: "tournamentId?" }, { status: 400 });

      const steamId = (body.steamId ?? "").trim();
      if (!/^\d{17}$/.test(steamId)) {
        return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
      }

      await prisma.tournamentOrganizer.upsert({
        where: {
          TournamentId_SteamId: { TournamentId: body.tournamentId, SteamId: BigInt(steamId) },
        },
        create: {
          TournamentId: body.tournamentId,
          SteamId: BigInt(steamId),
          Name: body.organizerName?.slice(0, 64) || null,
        },
        update: { Name: body.organizerName?.slice(0, 64) || undefined },
      });

      await logAdminAction(ctx, "tournament.organizer.add", { steamId }, `#${body.tournamentId}`);
      return NextResponse.json({ ok: true });
    }

    case "remove-organizer": {
      if (!body.tournamentId) return NextResponse.json({ error: "tournamentId?" }, { status: 400 });

      const steamId = (body.steamId ?? "").trim();
      if (!steamId) return NextResponse.json({ error: "steamId?" }, { status: 400 });

      // A tournament with no organizers can only be recovered by an admin, so
      // the last one is refused rather than being a mistake somebody notices
      // later. Removing yourself is fine as long as somebody else is left.
      const remaining = await prisma.tournamentOrganizer.count({
        where: { TournamentId: body.tournamentId },
      });
      if (remaining <= 1) {
        return NextResponse.json(
          { error: "That is the last organizer — add another before removing this one." },
          { status: 400 },
        );
      }

      await prisma.tournamentOrganizer.deleteMany({
        where: { TournamentId: body.tournamentId, SteamId: BigInt(steamId) },
      });

      await logAdminAction(ctx, "tournament.organizer.remove", { steamId }, `#${body.tournamentId}`);
      return NextResponse.json({ ok: true });
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
async function generate(body: Body, ctx: TournamentContext) {
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
