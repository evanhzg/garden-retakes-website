import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const steamId = BigInt(session.steamId);

  const status = await prisma.gardenSafeStatus.findUnique({
    where: { SteamId: steamId },
  });

  const pendingRequests = await prisma.gardenSafeRequest.findMany({
    where: { SteamId: steamId, Status: "PENDING" },
  });

  return NextResponse.json({
    status: status
      ? { ...status, SteamId: status.SteamId.toString() }
      : null,
    pendingRequests: pendingRequests.map(r => ({
      ...r,
      SteamId: r.SteamId.toString(),
    })),
  });
}
