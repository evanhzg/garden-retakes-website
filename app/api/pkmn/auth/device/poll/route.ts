import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issueAccessToken } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// POST /api/pkmn/auth/device/poll
// Body: { pollToken }
//
// The game client calls this every `interval` seconds (from /device/start)
// until it gets "confirmed" with a bearer token. 202 "pending" = keep
// waiting; 410 = the code expired, restart the pairing flow.
export async function POST(req: Request) {
  let body: { pollToken?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.pollToken) {
    return NextResponse.json({ error: "Missing pollToken" }, { status: 400 });
  }

  const link = await prisma.pkmnLinkCode.findUnique({ where: { PollToken: body.pollToken } });
  if (!link || link.ConsumedAtUtc) {
    return NextResponse.json({ error: "Unknown or already-used pairing session." }, { status: 404 });
  }
  if (link.ExpiresAtUtc.getTime() < Date.now()) {
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }
  if (!link.SteamId) {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  // Ensure the trainer row exists so /v1/trainer resolves immediately after
  // pairing (mirrors the auto-create in server.js's pkmn_join handler).
  await prisma.pkmnTrainer.upsert({
    where: { SteamId: link.SteamId },
    update: {},
    create: { SteamId: link.SteamId, Inventory: "{}", Badges: "[]" },
  });

  const steamId = link.SteamId.toString();
  const { token, expiresAt } = await issueAccessToken(steamId, link.DeviceName || undefined);

  // One-shot: this code can't be polled to a second token.
  await prisma.pkmnLinkCode.update({ where: { Code: link.Code }, data: { ConsumedAtUtc: new Date() } });

  return NextResponse.json({ status: "confirmed", token, steamId, expiresAt });
}
