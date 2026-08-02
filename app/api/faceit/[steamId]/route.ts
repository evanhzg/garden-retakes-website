import { NextResponse } from "next/server";
import { faceitConfigured, faceitForSteamId } from "@/lib/faceit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public: a player's FACEIT standing is public information on FACEIT itself,
// and the profile pages that render it are public too. The API key stays on the
// server — the browser only ever sees the resolved figures.

export async function GET(_req: Request, { params }: { params: { steamId: string } }) {
  if (!/^\d{17}$/.test(params.steamId)) {
    return NextResponse.json({ error: "steamid64 required" }, { status: 400 });
  }
  if (!faceitConfigured()) {
    return NextResponse.json({ error: "FACEIT is not configured (FACEIT_API_KEY)." }, { status: 503 });
  }

  const profile = await faceitForSteamId(params.steamId);
  if (!profile) {
    return NextResponse.json({ linked: false }, { headers: { "cache-control": "private, max-age=300" } });
  }

  return NextResponse.json(
    { linked: true, profile },
    { headers: { "cache-control": "private, max-age=300" } }
  );
}
