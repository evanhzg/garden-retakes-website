import { NextResponse } from "next/server";
import { prisma, getActiveSeason } from "@/lib/db";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import { rconExec } from "@/lib/rcon";

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
    demoModeState,
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
  ]);

  // What is actually running, so the panel can show which button is already the
  // answer instead of making an admin remember.
  let live: {
    map: string | null;
    mode: string | null;
    players: number | null;
    ranked?: boolean;
    competitive?: boolean;
  } = { map: null, mode: null, players: null };
  try {
    // css_gstatus answers in JSON. The old approach pattern-matched a localised
    // sentence out of css_gamemode, so the answer vanished whenever the wording
    // changed.
    const raw = await rconExec("css_gstatus");
    const json = /\{[^}]*\}/.exec(raw)?.[0];
    if (json) {
      const p = JSON.parse(json) as { map?: string; mode?: string; players?: number; ranked?: boolean; competitive?: boolean };
      live = {
        map: p.map ?? null,
        mode: p.mode ?? null,
        players: typeof p.players === "number" ? p.players : null,
        ranked: Boolean(p.ranked),
        competitive: Boolean(p.competitive),
      };
    }
  } catch {
    // Server unreachable — the board still works, it just cannot highlight.
  }

  const now = new Date();
  return NextResponse.json({
    live,
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
