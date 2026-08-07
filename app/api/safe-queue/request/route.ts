import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { DiscordId, Motivation, Gender, AgreedToRules } = body;

  if (typeof DiscordId !== "string" || typeof Motivation !== "string" || typeof Gender !== "string" || typeof AgreedToRules !== "boolean") {
    return NextResponse.json({ error: "Invalid fields" }, { status: 400 });
  }

  if (Motivation.length > 1000) {
    return NextResponse.json({ error: "Motivation too long" }, { status: 400 });
  }

  const steamId = BigInt(session.steamId);

  // Check if they already have a pending request
  const existing = await prisma.gardenSafeRequest.findFirst({
    where: { SteamId: steamId, Status: "PENDING" },
  });

  if (existing) {
    return NextResponse.json({ error: "Already have a pending request" }, { status: 400 });
  }

  const request = await prisma.gardenSafeRequest.create({
    data: {
      SteamId: steamId,
      DiscordId,
      Motivation,
      Gender,
      AgreedToRules,
      Status: "PENDING",
    },
  });

  return NextResponse.json({ success: true, request: { ...request, SteamId: request.SteamId.toString(), Id: request.Id } }, { status: 201 });
}
