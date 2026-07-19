import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/pkmn/auth/device/confirm
// Called by the BROWSER (pkmn.retakes.fr/link), never by the game client —
// requires the normal Steam-login cookie session. Links the pending code to
// the signed-in SteamID; the waiting game client picks it up via /device/poll.
export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in with Steam first." }, { status: 401 });
  }

  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const code = (body.code || "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const link = await prisma.pkmnLinkCode.findUnique({ where: { Code: code } });
  if (!link || link.ConsumedAtUtc || link.ExpiresAtUtc.getTime() < Date.now()) {
    return NextResponse.json({ error: "This code is invalid or has expired." }, { status: 410 });
  }

  await prisma.pkmnLinkCode.update({
    where: { Code: code },
    data: { SteamId: BigInt(session.steamId) },
  });

  return NextResponse.json({ ok: true, deviceName: link.DeviceName });
}
