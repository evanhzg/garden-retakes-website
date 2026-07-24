import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });

  try {
    await prisma.gardenDiscordLink.delete({
      where: { SteamId: BigInt(session.steamId) },
    });
  } catch {
    // No row / DB unreachable — nothing to unlink.
  }
  return NextResponse.json({ ok: true });
}
