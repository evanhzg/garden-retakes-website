import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveName } from "@/lib/names";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// GET /api/pkmn/v1/me
//
// Identity check + whether a trainer save exists yet. Good first call after
// pairing, to decide whether to show the starter picker before entering the
// overworld.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const [name, webProfile, trainer, monCount] = await Promise.all([
    resolveName(auth.steamId),
    prisma.gardenWebProfile.findUnique({ where: { SteamId: BigInt(auth.steamId) } }),
    prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(auth.steamId) } }),
    prisma.pkmnMon.count({ where: { OwnerId: BigInt(auth.steamId) } }),
  ]);

  return NextResponse.json({
    steamId: auth.steamId,
    name,
    avatarUrl: webProfile?.AvatarUrl ?? null,
    hasTrainer: !!trainer,
    hasStarter: monCount > 0,
  });
}
