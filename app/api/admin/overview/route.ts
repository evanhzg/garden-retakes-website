import { NextResponse } from "next/server";
import { prisma, getActiveSeason } from "@/lib/db";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// At-a-glance numbers for the admin overview.
//
// One request for the whole board rather than a fetch per card: these are all
// cheap counts, and a dashboard that populates one tile at a time looks broken
// even when it is working.

export async function GET(req: Request) {
  const ctx = await getAdminContext(new URL(req.url).searchParams.get("key"));
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const season = await getActiveSeason();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);

  const [
    players,
    activeBans,
    pendingDemos,
    clips,
    unlistedClips,
    lineups,
    clipRequests,
    recentActions,
    poll,
    seasonPlayers,
  ] = await Promise.all([
    prisma.playerProfile.count(),
    prisma.gardenBan.count({ where: { OR: [{ ExpiresAtUtc: null }, { ExpiresAtUtc: { gt: new Date() } }] } }).catch(() => 0),
    prisma.feedDemo.count({ where: { Status: { in: ["pending", "processing"] } } }).catch(() => 0),
    prisma.feedClip.count().catch(() => 0),
    prisma.feedClip.count({ where: { Unlisted: true } }).catch(() => 0),
    prisma.gardenNade.count().catch(() => 0),
    prisma.gardenClipRequest.count({ where: { Status: { in: ["pending", "processing"] } } }).catch(() => 0),
    prisma.gardenAdminLogEntry.count({ where: { AtUtc: { gte: dayAgo } } }).catch(() => 0),
    prisma.gardenVotePoll.findFirst({ orderBy: { Id: "desc" } }).catch(() => null),
    season
      ? prisma.playerSeasonStats.count({ where: { SeasonId: season.Id } }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  const now = new Date();
  return NextResponse.json({
    season: season ? { id: season.Id, name: season.Name, players: seasonPlayers } : null,
    counts: {
      players,
      activeBans,
      pendingDemos,
      clips,
      unlistedClips,
      lineups,
      clipRequests,
      recentActions,
    },
    poll: poll
      ? {
          id: poll.Id,
          seasonId: poll.SeasonId,
          closesAt: poll.ClosesAt.toISOString(),
          open: now >= poll.OpensAt && now < poll.ClosesAt,
        }
      : null,
  });
}
