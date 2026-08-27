import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { logAdminAction } from "@/lib/adminAuth";
import { addBotTeam, fillWithBots } from "@/lib/tournament/bots";
import { simulateTournament } from "@/lib/tournament/simulate";
import { startLiveBotMatch } from "@/lib/tournament/liveTest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The test-tournament controls: mark one as a test, fill it with bots, play it.
//
// Every action below refuses a tournament that is not flagged IsTest, and the
// flag itself is the only thing here an organizer sets by hand. That is the
// whole safety model: one deliberate switch, checked in each of the libraries
// rather than only here, so a future caller cannot route around it.

type Body = {
  key?: string;
  action?: "mark-test" | "add-bot-team" | "fill-bots" | "simulate" | "play-live";
  tournamentId?: number;
  isTest?: boolean;
  name?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const tournamentId = Number(body.tournamentId);
  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "tournamentId?" }, { status: 400 });
  }

  const ctx = await getTournamentContext(body.key);
  if (!(await canManage(ctx, tournamentId))) {
    return NextResponse.json({ error: "Not your tournament." }, { status: 403 });
  }

  switch (body.action) {
    // Turning the flag ON is refused once anybody real has entered. A test
    // tournament can gain bot teams and be resolved without a server, and
    // neither should ever happen to an event with players in it.
    case "mark-test": {
      const wanted = body.isTest !== false;

      if (wanted) {
        const humans = await prisma.tournamentTeamMember.count({
          where: { Team: { TournamentId: tournamentId }, IsBot: false },
        });
        if (humans > 0) {
          return NextResponse.json(
            { error: "Real players have already registered. Create a separate test tournament." },
            { status: 409 },
          );
        }
      }

      await prisma.tournament.update({
        where: { Id: tournamentId },
        data: { IsTest: wanted },
      });

      await logAdminAction(ctx, "tournament.mark-test", undefined, `${tournamentId}=${wanted}`);
      return NextResponse.json({ ok: true, isTest: wanted });
    }

    case "add-bot-team": {
      const result = await addBotTeam(tournamentId, body.name);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, teamId: result.teamId });
    }

    case "fill-bots": {
      const result = await fillWithBots(tournamentId);
      if (!result.ok && result.added === 0) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, added: result.added, error: result.error });
    }

    // Plays every playable match to completion, through the same finishMap()
    // the plugin's ingest calls — so this exercises the real bracket
    // advancement rather than a second implementation of it.
    case "simulate": {
      const result = await simulateTournament(tournamentId);
      await logAdminAction(ctx, "tournament.simulate", undefined, `${tournamentId}:${result.matchesPlayed}`);
      return NextResponse.json({ ok: true, ...result });
    }

    // Hand the next match to a real CS2 server and fill it with bots, so the
    // in-game half of the flow can be walked. Same startMatch() a real match
    // uses; the only addition is css_fill for the absent team-mates.
    case "play-live": {
      const result = await startLiveBotMatch(tournamentId);
      await logAdminAction(ctx, "tournament.play-live", undefined, `${tournamentId}:${result.ok}`);
      if (!result.ok) {
        return NextResponse.json({ error: result.error, log: result.log }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        message: `Live on ${result.connect ?? "the server"}`,
        connect: result.connect,
        log: result.log,
      });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
