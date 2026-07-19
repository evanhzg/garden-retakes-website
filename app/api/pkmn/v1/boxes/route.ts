import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";
import { maxHpForMon } from "@/scripts/pkmnItems";

export const dynamic = "force-dynamic";

const MAX_BOXES = 12;

// GET /api/pkmn/v1/boxes
//
// Every PC box with its stored Pokémon.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const boxes = await prisma.pkmnBox.findMany({
    where: { OwnerId: BigInt(auth.steamId) },
    include: { Pokemon: true },
  });

  return NextResponse.json({
    boxes: boxes.map((b) => ({
      id: b.Id,
      name: b.Name,
      pokemon: b.Pokemon.map((m) => ({
        id: m.Id,
        species: m.Species,
        nickname: m.Nickname,
        level: m.Level,
        hp: m.Hp,
        maxHp: maxHpForMon(m),
      })),
    })),
  });
}

// POST /api/pkmn/v1/boxes
// Body: { name?: string }
//
// Create a new PC box (capped at 12, same as the handheld games).
export async function POST(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const count = await prisma.pkmnBox.count({ where: { OwnerId: BigInt(auth.steamId) } });
  if (count >= MAX_BOXES) {
    return NextResponse.json({ error: `You already have the maximum of ${MAX_BOXES} boxes.` }, { status: 400 });
  }

  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    // default name is fine
  }

  const box = await prisma.pkmnBox.create({
    data: { OwnerId: BigInt(auth.steamId), Name: (body.name || `Box ${count + 1}`).trim().slice(0, 32) },
  });

  return NextResponse.json({ id: box.Id, name: box.Name, pokemon: [] }, { status: 201 });
}
