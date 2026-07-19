import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// GET /api/pkmn/auth/sessions
//
// Lists this trainer's active (non-revoked, non-expired) linked devices, for
// a "signed in on N devices" / "sign out other devices" screen. Token hashes
// are never returned.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const rows = await prisma.pkmnApiToken.findMany({
    where: { SteamId: BigInt(auth.steamId), RevokedAtUtc: null, ExpiresAtUtc: { gt: new Date() } },
    orderBy: { LastUsedAtUtc: "desc" },
    select: { Id: true, DeviceName: true, CreatedAtUtc: true, LastUsedAtUtc: true, ExpiresAtUtc: true },
  });

  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.Id,
      deviceName: r.DeviceName,
      createdAt: r.CreatedAtUtc,
      lastUsedAt: r.LastUsedAtUtc,
      expiresAt: r.ExpiresAtUtc,
      isCurrent: r.Id === auth.tokenId,
    })),
  });
}
