import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const steamIdHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!steamIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const steamId = BigInt(steamIdHeader);
    
    const { searchParams } = new URL(request.url);
    const targetIdStr = searchParams.get("targetId");
    if (!targetIdStr) return NextResponse.json({ error: "Missing targetId" }, { status: 400 });
    const targetId = BigInt(targetIdStr);

    const messages = await prisma.webMessage.findMany({
      where: {
        OR: [
          { SenderSteamId: steamId, RecipientSteamId: targetId },
          { SenderSteamId: targetId, RecipientSteamId: steamId }
        ]
      },
      orderBy: { CreatedAtUtc: "asc" },
      take: 50
    });

    const adminIds = (await prisma.gardenAdmin.findMany()).map(a => a.SteamId);

    return NextResponse.json(messages.map(m => ({
      id: m.Id,
      from: m.SenderSteamId.toString(),
      to: m.RecipientSteamId?.toString(),
      content: m.Content,
      ts: m.CreatedAtUtc.getTime(),
      isAdmin: adminIds.includes(m.SenderSteamId)
    })));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const steamIdHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!steamIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const steamId = BigInt(steamIdHeader);

    const { targetSteamId, content } = await request.json();
    if (!targetSteamId || !content) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const targetId = BigInt(targetSteamId);

    const message = await prisma.webMessage.create({
      data: {
        SenderSteamId: steamId,
        RecipientSteamId: targetId,
        Content: content
      }
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
