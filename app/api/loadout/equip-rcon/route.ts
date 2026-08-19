import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rconExec } from "@/lib/rcon";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  try {
    const res = await rconExec(`css_invsim_refresh ${session.steamId}`);
    return NextResponse.json({ ok: true, res });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
