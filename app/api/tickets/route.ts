import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionSteamId } from "@/lib/auth";
import { getAdminContext, AdminLevel } from "@/lib/adminAuth";


export async function GET() {
  try {
    /**
     * Staff, or your own.
     *
     * This used to read an Authorization header, ignore it, and return every
     * ticket on the site to anybody who asked — with a comment saying the admin
     * check happens "on client/nav" and should be done properly "in a real
     * setup". Hiding the link is not a permission: tickets are reports about
     * other players and they were one curl away.
     *
     * A signed-in player still gets their own, because "what happened to the
     * thing I reported" is a fair question and the page that asks it is this
     * one.
     */
    const ctx = await getAdminContext();
    const staff = ctx.level >= AdminLevel.Moderator;
    const me = sessionSteamId();

    if (!staff && !me) return NextResponse.json({ tickets: [] });

    const tickets = await prisma.webTicket.findMany({
      where: staff ? {} : { CreatorId: me! },
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
    // The session, and only the session. This used to PREFER the Authorization
    // header and fall back to the cookie — so the safe path existed, was
    // written, and was skipped whenever a caller supplied a header, which every
    // caller does. Filing a report in somebody else's name was one line of
    // curl.
    const steamId = sessionSteamId();
    if (!steamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
