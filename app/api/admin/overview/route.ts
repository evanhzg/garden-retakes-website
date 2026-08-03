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

  // What is actually running, so the panel can show which button is already the
  // answer instead of making an admin remember.
  let live: { map: string | null; mode: string | null; players: number | null } = {
    map: null,
    mode: null,
    players: null,
  };
  try {
    const status = await rconExec("status");
    const map = /^\s*(?:map|Map)\s*[:=]\s*(\S+)/m.exec(status)?.[1]?.split("/").pop()?.trim() ?? null;
    const players = Number(/players\s*:\s*(\d+)/i.exec(status)?.[1] ?? NaN);
    const mode = await rconExec("css_gamemode").catch(() => "");
    live = {
      map,
      // The plugin answers with the current mode name somewhere in its reply.
      mode: /\b(retakes|executes|practice|duels|faststrat|wingman|defender|hideandseek|spelltakers|edit)\b/i.exec(mode)?.[1]?.toLowerCase() ?? null,
      players: Number.isFinite(players) ? players : null,
    };
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
  });
}
