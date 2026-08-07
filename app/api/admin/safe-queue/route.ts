import { NextResponse } from "next/server";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  const ctx = await getAdminContext(key);
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const pendingRequests = await prisma.gardenSafeRequest.findMany({
    where: { Status: "PENDING" },
    orderBy: { CreatedAt: "asc" },
  });

  // Get user stats for these requests
  const steamIds = pendingRequests.map(r => r.SteamId);
  const stats = await prisma.playerSeasonStats.findMany({
    where: { SteamId: { in: steamIds } },
  });

  const pastVotes = await prisma.gardenMatchVote.findMany({
    where: { TargetSteamId: { in: steamIds } },
  });

  return NextResponse.json({
    requests: pendingRequests.map(r => ({ ...r, SteamId: r.SteamId.toString() })),
    stats: stats.map(s => ({ ...s, SteamId: s.SteamId.toString() })),
    pastVotes: pastVotes.map(v => ({
      ...v,
      VoterSteamId: v.VoterSteamId.toString(),
      TargetSteamId: v.TargetSteamId.toString(),
    })),
  });
}
