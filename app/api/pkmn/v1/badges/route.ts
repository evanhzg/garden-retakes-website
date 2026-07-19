import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePkmnAuth, isAuthContext } from "@/lib/pkmnAuth";

export const dynamic = "force-dynamic";

const MAX_BADGES = 12;

// GET /api/pkmn/v1/badges
export async function GET(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(auth.steamId) } });
  if (!trainer) {
    return NextResponse.json({ error: "No trainer save yet." }, { status: 404 });
  }

  return NextResponse.json({ badges: JSON.parse(trainer.Badges || "[]") });
}

// PATCH /api/pkmn/v1/badges
// Body: { badge: string }
//
// Awards a badge. Idempotent — awarding the same badge twice is a no-op, so
// the client can call this without first checking whether it's already held.
export async function PATCH(req: Request) {
  const auth = await requirePkmnAuth(req);
  if (!isAuthContext(auth)) return auth;

  let body: { badge?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const badge = (body.badge || "").trim().slice(0, 32);
  if (!badge) {
    return NextResponse.json({ error: "Missing badge" }, { status: 400 });
  }

  const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(auth.steamId) } });
  if (!trainer) {
    return NextResponse.json({ error: "No trainer save yet." }, { status: 404 });
  }

  const badges: string[] = JSON.parse(trainer.Badges || "[]");
  if (!badges.includes(badge) && badges.length < MAX_BADGES) {
    badges.push(badge);
  }

  await prisma.pkmnTrainer.update({
    where: { SteamId: BigInt(auth.steamId) },
    data: { Badges: JSON.stringify(badges) },
  });

  return NextResponse.json({ badges });
}
