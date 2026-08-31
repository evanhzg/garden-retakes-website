import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionSteamId } from "@/lib/auth";
import { toWireMessage } from "@/lib/webMessage";

// Direct messages between two players.
//
// Both handlers answer with `toWireMessage`. They used to disagree: the GET
// mapped its rows and the POST returned the Prisma row, which carries BigInt
// SteamIDs that JSON.stringify cannot serialise — so every send wrote its row
// and then answered 500, and the sender watched their own message get pulled
// back off the screen and their text returned to the box.

export async function GET(request: Request) {
  try {
    // From the session cookie, never the Authorization header. That header held
    // whatever SteamID the caller typed and this endpoint returns a private
    // conversation, so anybody could read anybody's DMs by asking as them.
    const steamId = sessionSteamId();
    if (!steamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const adminIds = (await prisma.gardenAdmin.findMany({ select: { SteamId: true } })).map(a => a.SteamId);

    return NextResponse.json(
      messages.map((m) => toWireMessage(m, adminIds.includes(m.SenderSteamId))),
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // From the session cookie. Sending a DM AS somebody else was one header
    // away — see the GET above and lib/auth.ts.
    const steamId = sessionSteamId();
    if (!steamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    return NextResponse.json({ success: true, message: toWireMessage(message) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
