import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/adminAuth";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, level: 0 }, { status: 401 });
  }

  const ctx = await getAdminContext();
  return NextResponse.json({
    authenticated: true,
    steamId: session.steamId,
    name: session.name,
    avatar: session.avatar,
    level: ctx.level,
    isAdmin: ctx.level > 0
  });
}
