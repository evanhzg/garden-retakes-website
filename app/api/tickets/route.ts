import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const steamIdHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    // Admin check happens on client/nav but we should protect it properly in a real setup.
    // For now, return all open or recently resolved tickets.
    
    const tickets = await prisma.webTicket.findMany({
      orderBy: { CreatedAtUtc: "desc" },
      take: 50
    });

    return NextResponse.json({ tickets: tickets.map(t => ({
      ...t,
      CreatorSteamId: t.CreatorId.toString(),
      AssignedAdminId: t.AssigneeId?.toString()
    })) });
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

    const { message, category } = await request.json();
    if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });

    const ticket = await prisma.webTicket.create({
      data: {
        CreatorId: steamId,
        Description: message,
        Topic: category || "REPORT",
        Status: "OPEN"
      }
    });

    return NextResponse.json({ success: true, ticket: { ...ticket, CreatorSteamId: ticket.CreatorId.toString() } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
