import { NextResponse } from "next/server";
import { playerTournamentHistory } from "@/lib/tournament/statsDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One player's tournament record, for the profile tab.
//
// Public, like the rest of a profile. Fetched when the tab is opened rather
// than rendered with the page: most visits to a profile never open it, and it
// costs three queries.

export async function GET(req: Request) {
  const steamId = new URL(req.url).searchParams.get("steamId") ?? "";

  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({ error: "steamId?" }, { status: 400 });
  }

  const history = await playerTournamentHistory(steamId);

  return NextResponse.json({ tournaments: history });
}
