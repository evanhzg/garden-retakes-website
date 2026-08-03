import { NextResponse } from "next/server";
import { prisma, getActiveSeason } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { CANDIDATE_COUNT, POLL_HOURS, VOTE_CATEGORIES, PLACEMENT_MEDALS, award, ensureMedals } from "@/lib/medals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Opening the season-end vote, and awarding placement medals.
//
// Owner-only: it ends a season's story, hands out medals and cannot be undone
// by clicking again.

export async function POST(req: Request) {
  const keyParam = new URL(req.url).searchParams.get("key");
  const ctx = await getAdminContext(keyParam);
  if (ctx.level < AdminLevel.Owner) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season." }, { status: 409 });

  await ensureMedals();

  // The ballot is the season's top ten, frozen now. Reading it live would let
  // the ballot change under people mid-vote.
  const standings = await prisma.playerSeasonStats.findMany({
    where: { SeasonId: season.Id },
    orderBy: { Elo: "desc" },
    take: CANDIDATE_COUNT,
    select: { SteamId: true },
  });
  if (standings.length === 0) return NextResponse.json({ error: "No standings to vote on." }, { status: 409 });

  const candidates = standings.map((s, i) => ({ steamId: s.SteamId.toString(), rank: i + 1 }));

  const opensAt = new Date();
  const closesAt = new Date(opensAt.getTime() + POLL_HOURS * 3600 * 1000);

  const poll = await prisma.gardenVotePoll.create({
    data: {
      SeasonId: season.Id,
      OpensAt: opensAt,
      ClosesAt: closesAt,
      Candidates: JSON.stringify(candidates),
    },
  });

  await prisma.gardenVoteCategory.createMany({
    data: VOTE_CATEGORIES.map((c, i) => ({
      PollId: poll.Id,
      Slug: c.slug,
      Name: c.name,
      Description: c.description,
      MedalSlug: c.medal.slug,
      Sort: (i + 1) * 10,
    })),
  });

  // Placement is a fact from the ladder, so it is awarded now rather than voted.
  for (let i = 0; i < Math.min(3, standings.length); i += 1) {
    await award(standings[i].SteamId, PLACEMENT_MEDALS[i].slug, season.Id, season.Name ?? `Season ${season.Id}`);
  }

  await logAdminAction(ctx, "vote.open", undefined, `season ${season.Id}, closes ${closesAt.toISOString()}`);

  return NextResponse.json({
    ok: true,
    pollId: poll.Id,
    closesAt: closesAt.toISOString(),
    candidates: candidates.length,
    placementAwarded: Math.min(3, standings.length),
  });
}
