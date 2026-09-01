import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchRows, summarize } from "@/lib/stats";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const steamId = BigInt(params.id);

    // Fetch the web profile
    const profile = await prisma.gardenWebProfile.findUnique({
      where: { SteamId: steamId }
    });

    // Fetch some basic stats
    const rows = await fetchRows(0, steamId, false); // season 0 usually gets active
    const total = summarize(rows);

    // What the site knows about them beyond their stats: the name people
    // actually see, and when they were last around. The bubble is opened to
    // decide whether to talk to somebody, and "last seen in March" answers
    // that better than a rating does.
    const known = await prisma.playerProfile.findUnique({
      where: { SteamId: steamId },
      select: { LastKnownName: true, LastSeenAtUtc: true },
    });

    return NextResponse.json({
      bio: profile?.Bio || "",
      country: profile?.Country || "",
      isPro: profile?.IsPro || false,
      rating: total.rating,
      winPct: total.winPct,
      rounds: total.rounds,
      name: known?.LastKnownName ?? null,
      lastSeen: known?.LastSeenAtUtc ? known.LastSeenAtUtc.getTime() : null,
      /** The status they chose. Null means online — see lib/presence.ts. */
      presence: profile?.Presence ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
