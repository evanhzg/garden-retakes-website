import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET/PUT whether the signed-in player has been walked through the
// matchmaking tutorial. One flag, one job — see the schema comment.

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ seenMatchmakingTutorial: true });

  const row = await prisma.gardenOnboardingState.findUnique({
    where: { SteamId: BigInt(session.steamId) },
  });

  return NextResponse.json({ seenMatchmakingTutorial: row?.SeenMatchmakingTutorial ?? false });
}

export async function PUT() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  await prisma.gardenOnboardingState.upsert({
    where: { SteamId: BigInt(session.steamId) },
    create: { SteamId: BigInt(session.steamId), SeenMatchmakingTutorial: true },
    update: { SeenMatchmakingTutorial: true },
  });

  return NextResponse.json({ ok: true });
}
