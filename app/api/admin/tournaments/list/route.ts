import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTournamentContext, manageableTournamentIds } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Every tournament the caller may manage, with its stages, for the setup page.
//
// Includes drafts, which the public list deliberately hides — the setup page is
// where a draft is worked on, so hiding them there would make one invisible the
// moment it was created.
//
// An organizer sees only their own. Filtering here rather than in the page is
// what keeps the rule in one place: the page renders whatever it is handed, and
// the buttons on those rows are gated again on the way back in.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getTournamentContext(url.searchParams.get("key"));

  if (!ctx.canCreate) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // null means "every tournament" — an admin or the superuser key.
  const mine = await manageableTournamentIds(ctx);

  const tournaments = await prisma.tournament.findMany({
    where: mine === null ? undefined : { Id: { in: mine } },
    orderBy: { Id: "desc" },
    take: 20,
    include: {
      Stages: { orderBy: { Ordinal: "asc" } },
      Organizers: true,
      _count: { select: { Teams: true } },
    },
  });

  const counts = await prisma.tournamentMatch.groupBy({
    by: ["StageId"],
    _count: { _all: true },
  });

  const matchesByStage = new Map(counts.map((c) => [c.StageId, c._count._all]));

  return NextResponse.json({
    role: ctx.roleName,
    managesAll: mine === null,
    tournaments: tournaments.map((t) => ({
      id: t.Id,
      name: t.Name,
      slug: t.Slug,
      state: t.State,
      teams: t._count.Teams,
      organizers: t.Organizers.map((o) => ({
        steamId: o.SteamId.toString(),
        name: o.Name ?? "",
        isCreator: o.IsCreator,
      })),
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
