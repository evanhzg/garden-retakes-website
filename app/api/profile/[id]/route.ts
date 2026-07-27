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

    return NextResponse.json({
      bio: profile?.Bio || "",
      country: profile?.Country || "",
      isPro: profile?.IsPro || false,
      rating: total.rating,
      winPct: total.winPct,
      rounds: total.rounds,
    });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
