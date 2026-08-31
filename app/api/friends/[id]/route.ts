import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionSteamId } from "@/lib/auth";


export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    // From the session cookie, and this one is why it matters most. The
    // ownership check below — only the addressee may accept — compared the
    // friendship against a SteamID the CALLER supplied, so it was checking an
    // attacker's claim against itself: send the id of the person the request
    // was sent to, and accept or delete it on their behalf.
    const steamId = sessionSteamId();
    if (!steamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const friendshipId = parseInt(params.id, 10);
    const { action } = await request.json(); // "ACCEPT" or "REJECT"

    const friendship = await prisma.webFriendship.findUnique({
      where: { Id: friendshipId }
    });

    if (!friendship) return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    
    // Only the addressee can accept or reject
    if (friendship.AddresseeId !== steamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "ACCEPT") {
      await prisma.webFriendship.update({
        where: { Id: friendshipId },
        data: { Status: "ACCEPTED" }
      });
      return NextResponse.json({ success: true, status: "ACCEPTED" });
    } else if (action === "REJECT") {
      // We can either delete it or mark it BLOCKED/REJECTED. Let's delete to allow re-sending later.
      await prisma.webFriendship.delete({
        where: { Id: friendshipId }
      });
      return NextResponse.json({ success: true, status: "DELETED" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
