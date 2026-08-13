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
  // First, remove existing placement medals for this season to prevent duplicates if rankings changed
  const placementSlugs = PLACEMENT_MEDALS.map(m => m.slug).filter(s => s.startsWith("season-"));
  await prisma.gardenPlayerMedal.deleteMany({
    where: {
      SeasonId: season.Id,
      MedalSlug: { in: placementSlugs },
    },
  });

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

export async function PATCH(req: Request) {
  const keyParam = new URL(req.url).searchParams.get("key");
  const ctx = await getAdminContext(keyParam);
  if (ctx.level < AdminLevel.Owner) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const now = new Date();
  const poll = await prisma.gardenVotePoll.findFirst({
    where: { ClosesAt: { lte: now } },
    orderBy: { Id: "desc" },
  });
  if (!poll) return NextResponse.json({ awarded: 0, note: "no closed poll" });

  const categories = await prisma.gardenVoteCategory.findMany({
    where: { PollId: poll.Id },
  });

  let awarded = 0;
  for (const c of categories) {
    const votes = await prisma.gardenVote.findMany({ where: { CategoryId: c.Id } });
    if (votes.length === 0) continue;
    const counts = new Map<string, number>();
    for (const v of votes) {
      const k = v.TargetSteamId.toString();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) continue;
    const [winner, count] = sorted[0];

    await prisma.gardenPlayerMedal.deleteMany({
      where: { SeasonId: poll.SeasonId, MedalSlug: c.MedalSlug },
    });

    await award(BigInt(winner), c.MedalSlug, poll.SeasonId, `${count} vote${count === 1 ? "" : "s"}`);
    awarded += 1;
  }

  await logAdminAction(ctx, "vote.close", undefined, `season ${poll.SeasonId}, awarded ${awarded}`);

  return NextResponse.json({ ok: true, awarded });
}
