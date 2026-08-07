import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAdminContext();
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });
  if (auth.level < AdminLevel.Owner) return new NextResponse("Forbidden", { status: 403 });

  // Get active season
  const activeSeason = await prisma.season.findFirst({
    where: { IsActive: true },
    select: { Id: true }
  });

  if (!activeSeason) {
    return NextResponse.json({ error: "No active season" }, { status: 400 });
  }

  const seasonId = activeSeason.Id;

  // Find players currently calibrating
  const calibratingStats = await prisma.playerSeasonStats.findMany({
    where: {
      SeasonId: seasonId,
      IsCalibrating: true
    },
    select: {
      SteamId: true,
      RankedRoundsPlayed: true
    }
  });

  const steamIds = calibratingStats.map(s => s.SteamId);

  if (steamIds.length === 0) {
    return NextResponse.json({ players: [] });
  }

  // Get profiles to resolve names
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: steamIds } },
    select: { SteamId: true, LastKnownName: true }
  });

  const nameMap = new Map(profiles.map(p => [p.SteamId.toString(), p.LastKnownName]));

  // Get all rounds for these players in the current season, but only Ranked ones
  const rounds = await prisma.playerRoundRecord.findMany({
    where: {
      SteamId: { in: steamIds },
      SeasonId: seasonId,
      IsRanked: true
    },
    select: {
      SteamId: true,
      PlayedAtUtc: true,
      EloAfter: true,
      EloDelta: true,
      Rating: true,
      Kast: true,
      Kills: true,
      Died: true
    },
    orderBy: {
      PlayedAtUtc: "asc"
    }
  });

  // Group by player
  const playersMap = new Map<string, any>();
  
  for (const stat of calibratingStats) {
    const steamId = stat.SteamId.toString();
    playersMap.set(steamId, {
      steamId,
      name: nameMap.get(steamId) || steamId,
      roundsPlayed: stat.RankedRoundsPlayed,
      rounds: []
    });
  }

  for (const r of rounds) {
    const steamId = r.SteamId.toString();
    const player = playersMap.get(steamId);
    if (player) {
      player.rounds.push({
        date: r.PlayedAtUtc,
        elo: r.EloAfter,
        delta: r.EloDelta,
        rating: r.Rating,
        kast: r.Kast,
        kills: r.Kills,
        died: r.Died
      });
    }
  }

  return NextResponse.json({ players: Array.from(playersMap.values()) });
}
