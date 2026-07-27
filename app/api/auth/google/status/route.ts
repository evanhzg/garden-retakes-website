import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ signedIn: false, configured: googleConfigured(), linked: false });
  }

  try {
    const link = await prisma.gardenGoogleLink.findUnique({
      where: { SteamId: BigInt(session.steamId) }
    });
    return NextResponse.json({
      signedIn: true,
      configured: googleConfigured(),
      linked: !!link,
      name: link?.GoogleName,
      avatar: link?.GoogleAvatar,
    });
  } catch {
    return NextResponse.json({ signedIn: true, configured: googleConfigured(), linked: false });
  }
}
