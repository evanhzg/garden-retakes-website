import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { discordConfigured } from "@/lib/discord";

export const dynamic = "force-dynamic";

// Current Discord link status for the profile "Connections" card.
export async function GET() {
  const session = getSession();
  const configured = discordConfigured();
  if (!session) return NextResponse.json({ signedIn: false, configured, linked: false });

  let linked = false;
  let name: string | null = null;
  let avatar: string | null = null;
  try {
    const row = await prisma.gardenDiscordLink.findUnique({
      where: { SteamId: BigInt(session.steamId) },
      select: { DiscordId: true, DiscordName: true, DiscordAvatar: true },
    });
    if (row?.DiscordId) {
      linked = true;
      name = row.DiscordName ?? null;
      avatar = row.DiscordAvatar ?? null;
    }
  } catch {
    // DB unreachable — report as unlinked.
  }
  return NextResponse.json({ signedIn: true, configured, linked, name, avatar });
}
