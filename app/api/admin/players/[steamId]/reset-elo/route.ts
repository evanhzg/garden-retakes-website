import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { STARTING_ELO } from "@/lib/competitive";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { steamId: string } }) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  
  // Require Admin level to reset ELO
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const steamId = params.steamId;
  if (!steamId || !/^\d{16,20}$/.test(steamId)) {
    return NextResponse.json({ error: "Invalid SteamID." }, { status: 400 });
  }

  // Find the active season
  const activeSeason = await prisma.season.findFirst({
    where: { IsActive: true },
    orderBy: { Id: 'desc' }
  });

  if (!activeSeason) {
    return NextResponse.json({ error: "No active season found." }, { status: 404 });
  }

  try {
    const stats = await prisma.playerSeasonStats.update({
      where: {
        SeasonId_SteamId: {
          SeasonId: activeSeason.Id,
          SteamId: BigInt(steamId),
        },
      },
      data: {
        Elo: STARTING_ELO,
        PeakElo: STARTING_ELO,
        RankedRoundsPlayed: 0,
        RankedRoundsWon: 0,
        IsCalibrating: true,
      },
    });

    await logAdminAction(
      ctx,
      "player.reset_elo",
      { steamId: BigInt(steamId) },
      `Reset ELO to ${STARTING_ELO} for season ${activeSeason.Id}`
    );

    return NextResponse.json({
      success: true,
      seasonId: activeSeason.Id,
      steamId,
      elo: stats.Elo
    });
  } catch (err: any) {
    // If the record doesn't exist, prisma throws an error
    if (err.code === 'P2025') {
      return NextResponse.json({ error: "Player has no stats for the current season." }, { status: 404 });
    }
    console.error("Error resetting ELO:", err);
    return NextResponse.json({ error: "Failed to reset ELO." }, { status: 500 });
  }
}
