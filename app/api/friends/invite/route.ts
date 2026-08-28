import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const steamIdHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!steamIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const steamId = BigInt(steamIdHeader);
    const { targetSteamId, lobbyId, password, kind } = await request.json();

    if (!targetSteamId || !lobbyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const target = BigInt(targetSteamId);

    // Ensure they are actually friends
    const friendship = await prisma.webFriendship.findFirst({
      where: {
        Status: "ACCEPTED",
        OR: [
          { RequesterId: steamId, AddresseeId: target },
          { RequesterId: target, AddresseeId: steamId }
        ]
      }
    });

    if (!friendship) return NextResponse.json({ error: "Not friends" }, { status: 403 });

    // Two different lobbies live on this site and this route serves both. It
    // used to build /games/lobby/<id> unconditionally, so a Blitz
    // invite sent whoever accepted it to the mini-game hub — a page with no
    // party of that id on it, which reads as an invite that expired.
    //
    // `kind` defaults to the mini-game path, which is what every existing
    // caller meant when it did not say.
    const retakes = kind === "retakes";
    let actionUrl = retakes ? `/lobby/${lobbyId}` : `/games/lobby/${lobbyId}`;
    if (password && !retakes) {
      actionUrl += `?password=${encodeURIComponent(password)}`;
    }

    // Get the sender's display name if possible
    let senderName = steamId.toString();
    const nameOver = await prisma.gardenNameOverride.findUnique({ where: { SteamId: steamId } });
    if (nameOver) {
      senderName = nameOver.Name;
    } else {
      const profile = await prisma.gardenWebProfile.findUnique({ where: { SteamId: steamId } });
      if (profile && profile.ProSlug) {
        senderName = profile.ProSlug;
      }
    }

    const notification = await prisma.webNotification.create({
      data: {
        SteamId: target,
        Type: "GAME_INVITE",
        Content: `${senderName} invited you to a lobby!`,
        ActionUrl: actionUrl,
        IsRead: false
      }
    });

    return NextResponse.json({ 
      success: true, 
      notification: {
        ...notification,
        SteamId: notification.SteamId.toString()
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
