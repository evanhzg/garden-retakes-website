import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");
  
  try {
    const stats = await prisma.webGameStats.findMany({
      where: gameId && gameId !== "all" ? { GameId: gameId } : undefined,
      orderBy: { Elo: 'desc' },
      take: 100,
    });
    
    const steamIds = stats.map(s => s.SteamId).filter((val, idx, arr) => arr.indexOf(val) === idx);
    const profiles = await prisma.playerProfile.findMany({
      where: { SteamId: { in: steamIds } },
      select: { SteamId: true, LastKnownName: true }
    });
    
    const nameMap = Object.fromEntries(profiles.map(p => [p.SteamId.toString(), p.LastKnownName]));
    
    const data = stats.map(s => ({
      steamId: s.SteamId.toString(),
      name: nameMap[s.SteamId.toString()] || "Unknown",
      gameId: s.GameId,
      matchesPlayed: s.MatchesPlayed,
      matchesWon: s.MatchesWon,
      totalScore: s.TotalScore,
      elo: s.Elo
    }));
    
    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch ladder" }, { status: 500 });
  }
}
