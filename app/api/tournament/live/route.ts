import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Every match that is currently being played, for the live wall.
//
// Public: this is what goes on a stream, and putting a session behind it would
// mean the overlay needs credentials. Nothing here is private — the scores are
// about to be shouted at an audience.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("t");

  const matches = await prisma.tournamentMatch.findMany({
    where: {
      State: { in: ["live", "ready"] },
      ...(slug ? { Tournament: { Slug: slug } } : {}),
    },
    include: {
      Maps: { orderBy: { Ordinal: "asc" } },
      Tournament: { select: { Name: true, Slug: true } },
    },
    orderBy: [{ StartedAt: "asc" }, { Id: "asc" }],
    take: 12,
  });

  const teamIds = Array.from(
    new Set(matches.flatMap((m) => [m.TeamAId, m.TeamBId]).filter(Boolean) as number[]),
  );

  const teams = await prisma.tournamentTeam.findMany({ where: { Id: { in: teamIds } } });
  const nameOf = new Map(teams.map((t) => [t.Id, { name: t.Name, tag: t.Tag }]));

  const serverIds = Array.from(new Set(matches.map((m) => m.ServerId).filter(Boolean) as number[]));
  const servers = await prisma.gameServer.findMany({ where: { Id: { in: serverIds } } });
  const serverOf = new Map(servers.map((s) => [s.Id, s]));

  return NextResponse.json({
    matches: matches.map((m) => {
      const live = m.Maps.find((x) => x.State === "live") ?? m.Maps[0];
      const server = m.ServerId ? serverOf.get(m.ServerId) : null;

      return {
        id: m.Id,
        matchKey: m.MatchKey,
        tournament: m.Tournament.Name,
        slug: m.Tournament.Slug,
        state: m.State,
        bestOf: m.BestOf,
        teamA: m.TeamAId ? nameOf.get(m.TeamAId) ?? null : null,
        teamB: m.TeamBId ? nameOf.get(m.TeamBId) ?? null : null,
        // Maps won, which is the match score.
        mapsA: m.ScoreA,
        mapsB: m.ScoreB,
        map: live?.Map ?? null,
        // Rounds on the map being played, which is what changes minute to minute.
        roundsA: live?.ScoreA ?? 0,
        roundsB: live?.ScoreB ?? 0,
        // Never the RCON password. This endpoint is public.
        gotv: server?.GotvAddress ?? null,
      };
    }),
  });
}
