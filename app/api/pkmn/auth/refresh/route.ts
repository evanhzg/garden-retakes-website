import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext, issueAccessToken } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// POST /api/pkmn/auth/refresh
//
// Rotates the calling device's bearer token. Call this periodically (e.g. on
// game launch) well before the 90-day expiry so the client is never forced
// back through the pairing flow while its current token is still valid.
export async function POST(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const old = await prisma.pkmnApiToken.findUnique({ where: { Id: auth.tokenId } });
  await prisma.pkmnApiToken.update({ where: { Id: auth.tokenId }, data: { RevokedAtUtc: new Date() } });

  const { token, expiresAt } = await issueAccessToken(auth.steamId, old?.DeviceName || undefined);
  return NextResponse.json({ token, expiresAt });
}
