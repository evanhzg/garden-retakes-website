import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { scoreboardFor } from "@/lib/tournament/scoreboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The match scoreboard, for the page to poll while a map is being played.
//
// The same scoreboardFor() the page renders its first paint with, so a viewer
// who arrives mid-map and a viewer who was already there see the same numbers
// rather than two computations of them.
//
// Public, with one gate: an unpublished tournament is not readable by anybody
// but its organizers, which is the same rule the match detail route applies.

export async function GET(req: Request) {
  const matchId = Number(new URL(req.url).searchParams.get("matchId"));
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "matchId?" }, { status: 400 });
  }

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { TournamentId: true, Tournament: { select: { Published: true } } },
  });

  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  if (!match.Tournament.Published) {
    const ctx = await getTournamentContext();
    if (!(await canManage(ctx, match.TournamentId))) {
      return NextResponse.json({ error: "No such match." }, { status: 404 });
    }
  }

  const board = await scoreboardFor(matchId);
  if (!board) return NextResponse.json({ error: "No such match." }, { status: 404 });

  return NextResponse.json(board);
}
