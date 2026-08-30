import { NextResponse } from "next/server";
import { prisma, getActiveSeason } from "@/lib/db";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import { serverSnapshot } from "@/lib/liveSnapshot";

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

  // Fourteen days: long enough to show a weekend, short enough that a quiet
  // fortnight does not squash a busy day into one pixel.
  const TREND_DAYS = 14;
  const since = new Date(Date.now() - TREND_DAYS * 24 * 3600 * 1000);

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
    demoModeState,
    matchDates,
    actionDates,
    tournamentStates,
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
    prisma.gardenSchedulerState.findUnique({ where: { Key: "DemoMode" } }).catch(() => null),
    // Raw rows rather than a grouped query: MySQL groups on the stored value,
    // and these are datetimes, so grouping would produce one bucket per second.
    // The bucketing is done below, in one pass, where the day boundary is
    // explicit instead of being whatever the database's timezone happens to be.
    prisma.tournamentMatch
      .findMany({ where: { EndedAt: { gte: since } }, select: { EndedAt: true } })
      .catch(() => []),
    prisma.gardenAdminLogEntry
      .findMany({ where: { AtUtc: { gte: since } }, select: { AtUtc: true } })
      .catch(() => []),
    prisma.tournament
      .groupBy({ by: ["State"], where: { Published: true }, _count: { _all: true } })
      .catch(() => []),
  ]);

  /** Counts per UTC day, zero-filled, oldest first. */
  const bucket = (dates: (Date | null)[]): { day: string; value: number }[] => {
    const counts = new Map<string, number>();
    for (const at of dates) {
      if (!at) continue;
      const key = at.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Zero-filled rather than only the days that had something: a chart that
    // skips empty days silently compresses a quiet week into a busy-looking one.
    const out: { day: string; value: number }[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      out.push({ day: d, value: counts.get(d) ?? 0 });
    }
    return out;
  };

  // What is actually running, so the panel can show which button is already the
  // answer instead of making an admin remember.
  let live: {
    map: string | null;
    mode: string | null;
    players: number | null;
    ranked?: boolean;
    competitive?: boolean;
  } = { map: null, mode: null, players: null };
  // Through the shared snapshot: this route and /api/server/live both wanted
  // the same answer and each ran its own RCON command for it. One command,
  // cached for a few seconds, serves both — and anything that polls later.
  const snapshot = await serverSnapshot();
  if (snapshot.online) {
    live = {
      map: snapshot.map,
      mode: snapshot.mode,
      players: snapshot.players,
      ranked: snapshot.ranked,
      competitive: snapshot.competitive,
    };
  }

  const now = new Date();
  return NextResponse.json({
    live,
    trends: {
      matches: bucket(matchDates.map((m) => m.EndedAt)),
      actions: bucket(actionDates.map((a) => a.AtUtc)),
    },
    tournaments: tournamentStates.map((row) => ({
      state: row.State,
      count: row._count._all,
    })),
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
    demoMode: demoModeState?.Value === "true",
  });
}
