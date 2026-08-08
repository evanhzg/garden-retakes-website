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

  const steamIds = pendingRequests.map(r => r.SteamId);
  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: steamIds } },
  });
  const statuses = await prisma.gardenSafeStatus.findMany({
    where: { SteamId: { in: steamIds } },
  });

  const enriched = pendingRequests.map(req => {
    const prof = profiles.find(p => p.SteamId === req.SteamId);
    const stat = statuses.find(s => s.SteamId === req.SteamId);
    return {
      id: req.Id,
      steamId: req.SteamId.toString(),
      name: prof?.LastKnownName || "Unknown",
      discordId: req.DiscordId,
      motivation: req.Motivation,
      gender: req.Gender,
      createdAt: req.CreatedAt.toISOString(),
      safeScore: stat?.SafeScore || 50,
      toxicityScore: stat?.ToxicityScore || 50,
      teamplayScore: stat?.TeamplayScore || 50,
    };
  });

  return NextResponse.json(enriched);
}
