import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const steamIdHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!steamIdHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const steamId = BigInt(steamIdHeader);
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
