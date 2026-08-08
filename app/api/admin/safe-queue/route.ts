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

export async function POST(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  const ctx = await getAdminContext(key);
  if (ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { requestId, action } = body;
  if (!requestId || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const request = await prisma.gardenSafeRequest.findUnique({ where: { Id: requestId } });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (request.Status !== "PENDING") {
    return NextResponse.json({ error: "Already processed" }, { status: 400 });
  }

  let targetStatus = "";
  let requestStatus = "";
  if (action === "APPROVE_PROBATION") {
    targetStatus = "PROBING";
    requestStatus = "APPROVED";
  } else if (action === "APPROVE_PERMANENT") {
    targetStatus = "ACTIVE";
    requestStatus = "APPROVED";
  } else if (action === "REJECT") {
    targetStatus = "REJECTED";
    requestStatus = "REJECTED";
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await prisma.gardenSafeRequest.update({
    where: { Id: requestId },
    data: { Status: requestStatus },
  });

  await prisma.gardenSafeStatus.upsert({
    where: { SteamId: request.SteamId },
    create: {
      SteamId: request.SteamId,
      Status: targetStatus,
    },
    update: {
      Status: targetStatus,
    },
  });

  return NextResponse.json({ success: true });
}
