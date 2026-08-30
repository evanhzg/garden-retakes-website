import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { raiseAlert } from "@/lib/tournament/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A player typed .admin.
//
// The server has already paused itself — or will at the next freezetime — so
// this is not what makes the pause happen. It is what makes somebody KNOW, and
// it must therefore not be able to fail in a way that loses the call: the row is
// written first, and only then is anybody notified.

type Incoming = {
  apiKey?: string;
  matchKey?: string;
  map?: string;
  steamId?: string;
  name?: string;
  team?: string;
  score?: string;
  reason?: string;
};

export async function POST(req: Request) {
  let body: Incoming;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const key = process.env.INVSIM_API_KEY;
  if (!key || body.apiKey !== key) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const steamId = (body.steamId ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({ error: "A SteamID64 is required." }, { status: 400 });
  }

  // Through the shared path rather than writing the row here.
  //
  // It resolves the match and its tournament, which is what gives an organizer
  // a link to click and scopes the alert to the event they actually run, and it
  // DMs them. None of that existed when this route was the only writer, and
  // duplicating it here would mean a call from the game and a call from the
  // match room behaving differently for no reason anybody chose.
  const alert = await raiseAlert({
    source: "game",
    matchKey: (body.matchKey ?? "").slice(0, 64),
    map: body.map ?? null,
    steamId,
    name: body.name ?? null,
    team: body.team ?? null,
    score: body.score ?? null,
    reason: body.reason ?? null,
  });

  return NextResponse.json({ ok: true, id: alert.Id });
}

/** Open calls, for the owner's page and the desktop app to poll. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = process.env.INVSIM_API_KEY;

  if (!key || url.searchParams.get("key") !== key) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const alerts = await prisma.tournamentAlert.findMany({
    where: { AckedAt: null },
    orderBy: { CreatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    alerts: alerts.map((a) => ({
      id: a.Id,
      matchKey: a.MatchKey,
      map: a.Map,
      steamId: a.SteamId.toString(),
      name: a.Name,
      team: a.Team,
      score: a.Score,
      reason: a.Reason,
      at: a.CreatedAt.toISOString(),
    })),
  });
}
