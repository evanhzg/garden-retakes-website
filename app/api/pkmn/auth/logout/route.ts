import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// POST /api/pkmn/auth/logout
//
// Revokes only the calling device's token. To sign out a *different* device,
// use DELETE /api/pkmn/auth/sessions/:id instead.
export async function POST(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  await prisma.pkmnApiToken.update({ where: { Id: auth.tokenId }, data: { RevokedAtUtc: new Date() } });
  return NextResponse.json({ ok: true });
}
