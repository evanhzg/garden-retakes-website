import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// DELETE /api/pkmn/auth/sessions/:id
//
// Revoke one specific device's token (e.g. "I lost my laptop, sign it out").
// Only the owning trainer may revoke their own sessions.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const row = await prisma.pkmnApiToken.findUnique({ where: { Id: params.id } });
  if (!row || row.SteamId.toString() !== auth.steamId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.pkmnApiToken.update({ where: { Id: params.id }, data: { RevokedAtUtc: new Date() } });
  return NextResponse.json({ ok: true });
}
