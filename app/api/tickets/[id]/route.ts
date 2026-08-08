import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { Status } = await request.json();
    const id = parseInt(params.id, 10);
    
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const ticket = await prisma.webTicket.update({
      where: { Id: id },
      data: { Status }
    });

    return NextResponse.json({ success: true, ticket: { ...ticket, CreatorSteamId: ticket.CreatorSteamId.toString(), AssignedAdminId: ticket.AssignedAdminId?.toString() } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
