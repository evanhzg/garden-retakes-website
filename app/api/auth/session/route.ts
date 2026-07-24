import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ authenticated: false });

  // Expose the admin level so the NavBar can reveal the Admin link.
  let adminLevel = 0;
  try {
    const row = await prisma.gardenAdmin.findUnique({
      where: { SteamId: BigInt(session.steamId) },
      select: { Level: true },
    });
    adminLevel = row?.Level ?? 0;
  } catch {
    // DB unreachable — treat as non-admin for the nav.
  }

  return NextResponse.json({
    authenticated: true,
    steamId: session.steamId,
    name: session.name ?? null,
    avatar: session.avatar ?? null,
    adminLevel,
  });
}
