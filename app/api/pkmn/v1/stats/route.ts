import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

// GET /api/pkmn/v1/stats
//
// Everything we can honestly report today. Fields the game doesn't track yet
// (playtime, distance walked, battles won, ...) are left out rather than
// faked — add them here as the corresponding systems land.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const [trainer, mons] = await Promise.all([
    prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(auth.steamId) } }),
    prisma.pkmnMon.findMany({ where: { OwnerId: BigInt(auth.steamId) }, select: { Species: true, BoxId: true } }),
  ]);
  if (!trainer) {
    return NextResponse.json({ error: "No trainer save yet." }, { status: 404 });
  }

  const speciesCaught = new Set(mons.map((m) => m.Species));

  return NextResponse.json({
    badges: JSON.parse(trainer.Badges || "[]").length,
    pokemonOwned: mons.length,
    partySize: mons.filter((m) => m.BoxId === null).length,
    speciesCaught: speciesCaught.size,
    money: trainer.Money,
  });
}
