import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";


export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    // Staff only. This had no check of any kind: anybody who could reach the
    // site could close, reopen or reclassify any ticket on it, including the
    // reports about themselves. The panel is admin-only, which hides the
    // button and nothing else.
    const ctx = await getAdminContext();
    if (ctx.level < AdminLevel.Moderator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { Status } = await request.json();
    const id = parseInt(params.id, 10);

    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    // A ticket whose status says "BANANA" is not a state anything downstream
    // knows how to draw, and the column takes whatever it is given.
    //
    // These two are the ones the site actually writes and reads: POST creates
    // OPEN, the notification centre counts OPEN and sets RESOLVED. CLOSED and
    // IN_PROGRESS look plausible and are not real — nothing produces them and
    // nothing renders them.
    const ALLOWED = ["OPEN", "RESOLVED"];
    if (typeof Status !== "string" || !ALLOWED.includes(Status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }

    const ticket = await prisma.webTicket.update({
      where: { Id: id },
      data: { Status }
    });

    return NextResponse.json({ success: true, ticket: { ...ticket, CreatorSteamId: ticket.CreatorId.toString(), AssignedAdminId: ticket.AssigneeId?.toString() } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
