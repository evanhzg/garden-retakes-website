import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

async function loadOwnedMon(id: string, steamId: string) {
  const mon = await prisma.pkmnMon.findUnique({ where: { Id: id } });
  if (!mon || mon.OwnerId.toString() !== steamId) return null;
  return mon;
}

// PATCH /api/pkmn/v1/mon/:id
// Body: any subset of { nickname, moves: string[] (max 4), status }
//
// Rename a Pokémon, or (mostly for custom content/admin tooling later)
// directly set its moves/status.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const mon = await loadOwnedMon(params.id, auth.steamId);
  if (!mon) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.nickname === "string") {
    data.Nickname = body.nickname.trim().slice(0, 24) || null;
  }
  if (
    Array.isArray(body.moves) &&
    body.moves.length <= 4 &&
    body.moves.every((m) => typeof m === "string")
  ) {
    data.Moves = JSON.stringify(body.moves);
  }
  if (typeof body.status === "string" || body.status === null) {
    data.Status = body.status;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  await prisma.pkmnMon.update({ where: { Id: mon.Id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE /api/pkmn/v1/mon/:id
//
// Release a Pokémon. Irreversible — the client should confirm with the
// player before calling this, same as the handheld games.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const mon = await loadOwnedMon(params.id, auth.steamId);
  if (!mon) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.pkmnMon.delete({ where: { Id: mon.Id } });
  return NextResponse.json({ ok: true });
}
