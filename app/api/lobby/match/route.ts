import { NextResponse } from "next/server";
import { createPickupMatch } from "@/lib/tournament/pickupMatch";
import { isPickupSize } from "@/lib/tournament/pickup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The seam between the matchmaking lobby and the tournament machinery.
//
// The socket server forms the two teams; everything after that — the role
// draft, the veto, claiming a free server from the pool, the scoreboard — is
// the tournament pipeline, which already exists and is already tested. So the
// lobby's hand-off is one call to here rather than its own RCON sequence
// against a hardcoded server.
//
// That sequence is why matchmaking was broken: it spoke the all-in-one plugin's
// `css_cr_*` protocol, and the server it aimed at now runs the tournament
// plugin, which answers "Unknown command". Rather than teach the lobby the new
// protocol, this makes a pickup a real match and lets the machinery that speaks
// it do the talking.
//
// Guarded by the same shared key as the other machine callers (INVSIM_API_KEY),
// because the socket server is a service and has no player session to present.

export async function POST(request: Request) {
  const secret = (process.env.INVSIM_API_KEY ?? "").trim();
  if (!secret) {
    return NextResponse.json({ error: "INVSIM_API_KEY not configured" }, { status: 500 });
  }

  let body: {
    apiKey?: string;
    teamSize?: number;
    teamA?: string[];
    teamB?: string[];
    names?: Record<string, string | null>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if ((body.apiKey ?? "").trim() !== secret) {
    return NextResponse.json({ error: "bad key" }, { status: 401 });
  }

  const teamSize = Number(body.teamSize);
  if (!isPickupSize(teamSize)) {
    return NextResponse.json(
      { error: `teamSize must be one the servers run (2 or 3), got ${body.teamSize}` },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.teamA) || !Array.isArray(body.teamB)) {
    return NextResponse.json({ error: "teamA and teamB must be arrays of SteamID64" }, { status: 400 });
  }

  const result = await createPickupMatch({
    teamSize,
    a: { players: body.teamA.map(String) },
    b: { players: body.teamB.map(String) },
    names: body.names,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // The match is NOT started here. It is created in `pending`, which is where
  // the match page picks it up: ready-up, then the role draft, then the veto,
  // and only then does anything ask for a server. Starting it now would claim a
  // server before anybody has agreed a map, and hold it through the whole draft.
  return NextResponse.json({
    ok: true,
    matchId: result.matchId,
    slug: result.slug,
    url: result.url,
  });
}
