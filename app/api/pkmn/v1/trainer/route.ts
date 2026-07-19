import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";
import { maxHpForMon, parseInv, buildBagList } from "@/scripts/pkmnItems";

export const dynamic = "force-dynamic";

function serializeMon(m: any) {
  return {
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
  };
}

// GET /api/pkmn/v1/trainer
//
// The full save blob: position/map, money, badges, bag and current party
// (PC-box Pokémon come from /api/pkmn/v1/boxes). This is what the Unity
// client loads on startup / world join.
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const trainer = await prisma.pkmnTrainer.findUnique({
    where: { SteamId: BigInt(auth.steamId) },
    include: { Party: { where: { BoxId: null } } },
  });
  if (!trainer) {
    return NextResponse.json({ error: "No trainer save yet." }, { status: 404 });
  }

  return NextResponse.json({
    steamId: auth.steamId,
    money: trainer.Money,
    currentMap: trainer.CurrentMap,
    posX: trainer.PosX,
    posY: trainer.PosY,
    facing: trainer.Facing,
    badges: JSON.parse(trainer.Badges || "[]"),
    bag: buildBagList(parseInv(trainer.Inventory)),
    party: trainer.Party.map(serializeMon),
  });
}

const ALLOWED_FACINGS = new Set(["up", "down", "left", "right"]);

// PUT /api/pkmn/v1/trainer
//
// Checkpoint/autosave: position, current map, facing and money. Party, box,
// inventory and badges each have their own endpoint so each can be validated
// on its own terms. Body: any subset of
// { currentMap, posX, posY, facing, money }.
export async function PUT(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.currentMap === "string" && body.currentMap.length <= 64) data.CurrentMap = body.currentMap;
  if (typeof body.posX === "number" && Number.isFinite(body.posX)) data.PosX = Math.round(body.posX);
  if (typeof body.posY === "number" && Number.isFinite(body.posY)) data.PosY = Math.round(body.posY);
  if (typeof body.facing === "string" && ALLOWED_FACINGS.has(body.facing)) data.Facing = body.facing;
  if (typeof body.money === "number" && Number.isFinite(body.money) && body.money >= 0) {
    data.Money = Math.round(body.money);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const trainer = await prisma.pkmnTrainer
    .update({ where: { SteamId: BigInt(auth.steamId) }, data })
    .catch(() => null);
  if (!trainer) {
    return NextResponse.json({ error: "No trainer save yet." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
