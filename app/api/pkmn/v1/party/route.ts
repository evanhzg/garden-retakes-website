import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";
import { maxHpForMon } from "@/scripts/pkmnItems";

export const dynamic = "force-dynamic";

// GET /api/pkmn/v1/party
//
// The trainer's active party (max 6, BoxId null). For PC-box Pokémon, see
// /api/pkmn/v1/boxes. To move a Pokémon between party and box, use
// POST /api/pkmn/v1/mon/:id/move.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const mons = await prisma.pkmnMon.findMany({
    where: { OwnerId: BigInt(auth.steamId), BoxId: null },
  });

  return NextResponse.json({
    party: mons.map((m) => ({
      id: m.Id,
      species: m.Species,
      nickname: m.Nickname,
      level: m.Level,
      exp: m.Exp,
      hp: m.Hp,
      maxHp: maxHpForMon(m),
      status: m.Status,
      ability: m.Ability,
      nature: m.Nature,
      moves: JSON.parse(m.Moves || "[]"),
      ivs: JSON.parse(m.Ivs || "{}"),
      evs: JSON.parse(m.Evs || "{}"),
    })),
  });
}
