import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const steamIdHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!steamIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (steamIdHeader.startsWith("GUEST_")) return NextResponse.json([]);

    const steamId = BigInt(steamIdHeader);

    // Fetch friendships where the user is either the requester or addressee
    const friendships = await prisma.webFriendship.findMany({
      where: {
        OR: [{ RequesterId: steamId }, { AddresseeId: steamId }],
      },
    });

    // Resolve profiles for these friendships
    const friendIds = friendships.map(f => 
      f.RequesterId === steamId ? f.AddresseeId : f.RequesterId
    );

    const profiles = await prisma.gardenWebProfile.findMany({
      where: { SteamId: { in: friendIds } }
    });

    // Also get overrides for names
    const names = await prisma.gardenNameOverride.findMany({
      where: { SteamId: { in: friendIds } }
    });

    // Get Admins to add them as default friends
    const admins = await prisma.gardenAdmin.findMany();
    const adminIds = admins.map(a => a.SteamId);
    
    // Add admin IDs to profiles/names query if missing, or just run a separate query
    const missingAdminIds = adminIds.filter(id => !friendIds.includes(id) && id !== steamId);
    if (missingAdminIds.length > 0) {
      const adminProfiles = await prisma.gardenWebProfile.findMany({
        where: { SteamId: { in: missingAdminIds } }
      });
      const adminNames = await prisma.gardenNameOverride.findMany({
        where: { SteamId: { in: missingAdminIds } }
      });
      profiles.push(...adminProfiles);
      names.push(...adminNames);
    }

    const enrichedFriendships = friendships.map(f => {
      const friendId = f.RequesterId === steamId ? f.AddresseeId : f.RequesterId;
      const profile = profiles.find(p => p.SteamId === friendId);
      const nameOver = names.find(n => n.SteamId === friendId);
      return {
        id: f.Id,
        friendId: friendId.toString(),
        name: nameOver?.Name || `Player ${friendId.toString().slice(-4)}`,
        avatarUrl: profile?.AvatarUrl || null,
        status: f.Status,
        isRequester: f.RequesterId === steamId
      };
    });

    // Add admins as default friends if not already present in enrichedFriendships
    for (const admin of admins) {
      if (admin.SteamId === steamId) continue; // Skip self
      if (enrichedFriendships.find(f => f.friendId === admin.SteamId.toString())) continue;

      const profile = profiles.find(p => p.SteamId === admin.SteamId);
      const nameOver = names.find(n => n.SteamId === admin.SteamId);
      enrichedFriendships.push({
        id: -Number(admin.SteamId), // fake ID
        friendId: admin.SteamId.toString(),
        name: nameOver?.Name || admin.Name || `Admin ${admin.SteamId.toString().slice(-4)}`,
        avatarUrl: profile?.AvatarUrl || null,
        status: "ACCEPTED",
        isRequester: false
      });
    }

    return NextResponse.json(enrichedFriendships);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const steamIdHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!steamIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (steamIdHeader.startsWith("GUEST_")) return NextResponse.json({ error: "Guests cannot add friends" }, { status: 403 });

    const steamId = BigInt(steamIdHeader);
    const { targetSteamId } = await request.json();

    if (!targetSteamId) return NextResponse.json({ error: "Missing targetSteamId" }, { status: 400 });

    const target = BigInt(targetSteamId);
    if (steamId === target) return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });

    // Check if exists
    const existing = await prisma.webFriendship.findFirst({
      where: {
        OR: [
          { RequesterId: steamId, AddresseeId: target },
          { RequesterId: target, AddresseeId: steamId },
        ]
      }
    });

    if (existing) return NextResponse.json({ error: "Friendship already exists" }, { status: 400 });

    const friendship = await prisma.webFriendship.create({
      data: {
        RequesterId: steamId,
        AddresseeId: target,
        Status: "PENDING"
      }
    });

    // Create Notification
    const notification = await prisma.webNotification.create({
      data: {
        SteamId: target,
        Type: "FRIEND_REQUEST",
        Content: `${steamIdHeader} sent you a friend request.`,
        IsRead: false
      }
    });

    return NextResponse.json({ 
      success: true, 
      friendship: {
        ...friendship,
        RequesterId: friendship.RequesterId.toString(),
        AddresseeId: friendship.AddresseeId.toString()
      },
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
