import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext } from "@/lib/adminAuth";
import { AdminLevel } from "@/lib/adminImmunity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Every tournament with its stages, for the setup page.
//
// Includes drafts, which the public list deliberately hides — the setup page is
// where a draft is worked on, so hiding them there would make one invisible the
// moment it was created.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));

  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const tournaments = await prisma.tournament.findMany({
    orderBy: { Id: "desc" },
    take: 20,
    include: {
      Stages: { orderBy: { Ordinal: "asc" } },
      _count: { select: { Teams: true } },
    },
  });

  const counts = await prisma.tournamentMatch.groupBy({
    by: ["StageId"],
    _count: { _all: true },
  });

  const matchesByStage = new Map(counts.map((c) => [c.StageId, c._count._all]));

  return NextResponse.json({
    tournaments: tournaments.map((t) => ({
      id: t.Id,
      name: t.Name,
      slug: t.Slug,
      state: t.State,
      teams: t._count.Teams,
      stages: t.Stages.map((s) => ({
        id: s.Id,
        name: s.Name,
        kind: s.Kind,
        bestOf: s.BestOf,
        matches: matchesByStage.get(s.Id) ?? 0,
      })),
    })),
  });
}
