import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionSteamId } from "@/lib/auth";
import { resolveName } from "@/lib/names";


export async function GET() {
  try {
    // The session cookie, NOT the Authorization header the callers still send.
    // That header carried whatever SteamID the caller typed, so this endpoint
    // would hand anybody anybody else's friends list.
    //
    // A guest has no SteamID and therefore no friends: an empty list rather
    // than a 401, because that is what the page wants to draw.
    const steamId = sessionSteamId();
    if (!steamId) return NextResponse.json([]);

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

    const stats = await prisma.playerSeasonStats.findMany({
      where: { SteamId: { in: friendIds } }
    });

    const playerProfiles = await prisma.playerProfile.findMany({
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
      const adminStats = await prisma.playerSeasonStats.findMany({
        where: { SteamId: { in: missingAdminIds } }
      });
      const adminPlayerProfiles = await prisma.playerProfile.findMany({
        where: { SteamId: { in: missingAdminIds } }
      });
      stats.push(...adminStats);
      playerProfiles.push(...adminPlayerProfiles);
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
    // From the cookie. Sending a friend request AS somebody else was one
    // header away — see the GET above and lib/auth.ts.
    const steamId = sessionSteamId();
    if (!steamId) {
      return NextResponse.json({ error: "Sign in to add friends" }, { status: 401 });
    }

    const { targetSteamId } = await request.json();

    if (!targetSteamId) return NextResponse.json({ error: "Missing targetSteamId" }, { status: 400 });

    let target: bigint;
    try {
      target = BigInt(targetSteamId);
    } catch {
      // It's a nickname
      const nameMatch = await prisma.gardenNameOverride.findFirst({
        where: { Name: targetSteamId }
      });
      if (nameMatch) {
        target = nameMatch.SteamId;
      } else {
        const profileMatch = await prisma.playerProfile.findFirst({
          where: { LastKnownName: targetSteamId }
        });
        if (profileMatch) {
          target = profileMatch.SteamId;
        } else {
          return NextResponse.json({ error: "Player not found" }, { status: 404 });
        }
      }
    }

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
        // The sender's name, not their SteamID. This read
        // "76561198… sent you a friend request" because it interpolated the
        // raw header it used to authenticate with, which is a number nobody
        // recognises — least of all as the person they just met in a server.
        Content: `${await resolveName(steamId.toString())} sent you a friend request.`,
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
