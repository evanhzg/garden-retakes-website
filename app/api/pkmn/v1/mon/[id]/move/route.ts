import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

const MAX_PARTY_SIZE = 6;

// POST /api/pkmn/v1/mon/:id/move
// Body: { boxId: string | null }  (null = into the active party)
//
// Moves a Pokémon between the active party and a PC box. Enforces the 6-mon
// party cap and that the party never goes empty.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const mon = await prisma.pkmnMon.findUnique({ where: { Id: params.id } });
  if (!mon || mon.OwnerId.toString() !== auth.steamId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { boxId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const targetBoxId = body.boxId ?? null;

  if (targetBoxId === null) {
    if (mon.BoxId !== null) {
      const partyCount = await prisma.pkmnMon.count({ where: { OwnerId: mon.OwnerId, BoxId: null } });
      if (partyCount >= MAX_PARTY_SIZE) {
        return NextResponse.json({ error: "Party is full (6/6)." }, { status: 400 });
      }
    }
  } else {
    const box = await prisma.pkmnBox.findUnique({ where: { Id: targetBoxId } });
    if (!box || box.OwnerId.toString() !== auth.steamId) {
      return NextResponse.json({ error: "Box not found." }, { status: 404 });
    }
    if (mon.BoxId === null) {
      const partyCount = await prisma.pkmnMon.count({ where: { OwnerId: mon.OwnerId, BoxId: null } });
      if (partyCount <= 1) {
        return NextResponse.json({ error: "You can't box your last Pokémon." }, { status: 400 });
      }
    }
  }

  await prisma.pkmnMon.update({ where: { Id: mon.Id }, data: { BoxId: targetBoxId } });
  return NextResponse.json({ ok: true, boxId: targetBoxId });
}
