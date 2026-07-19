import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLinkCode, randomOpaqueToken, pkmnSiteOrigin } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

const LINK_CODE_TTL_MS = 10 * 60 * 1000;

// POST /api/pkmn/auth/device/start
// Body: { deviceName?: string }
//
// First call of the pairing flow: the game client gets a short code to show
// the player + a pollToken only it knows. Show the code (or open verifyUrl
// directly in the system browser), then poll /device/poll with pollToken
// every `interval` seconds until "confirmed".
export async function POST(req: Request) {
  let body: { deviceName?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const pollToken = randomOpaqueToken();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  const deviceName = body.deviceName?.trim().slice(0, 64) || null;

  let code = generateLinkCode();
  let created = false;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      await prisma.pkmnLinkCode.create({
        data: { Code: code, PollToken: pollToken, DeviceName: deviceName, ExpiresAtUtc: expiresAt },
      });
      created = true;
    } catch {
      code = generateLinkCode(); // collision on the (very small) code space — retry
    }
  }
  if (!created) {
    return NextResponse.json({ error: "Could not allocate a link code, try again." }, { status: 503 });
  }

  const origin = pkmnSiteOrigin(new URL(req.url).origin);
  return NextResponse.json({
    code,
    pollToken,
    verifyUrl: `${origin}/link?code=${code}`,
    expiresIn: Math.floor(LINK_CODE_TTL_MS / 1000),
    interval: 4,
  });
}
