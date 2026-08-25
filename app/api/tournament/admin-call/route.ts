import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

  const alert = await prisma.tournamentAlert.create({
    data: {
      MatchKey: (body.matchKey ?? "").slice(0, 64),
      Map: (body.map ?? "").slice(0, 64) || null,
      SteamId: BigInt(steamId),
      Name: (body.name ?? "").slice(0, 64) || null,
      Team: (body.team ?? "").slice(0, 64) || null,
      Score: (body.score ?? "").slice(0, 16) || null,
      Reason: (body.reason ?? "").slice(0, 240) || null,
    },
  });

  // The socket is the fast path, the row is the durable one. A failed emit
  // leaves an alert somebody still sees on the page; a failed write would lose
  // it entirely, which is why the order is this way round.
  try {
    const io = (globalThis as { __gardenIo?: { emit: (event: string, payload: unknown) => void } }).__gardenIo;
    io?.emit("t:alert", {
      id: alert.Id,
      matchKey: alert.MatchKey,
      map: alert.Map,
      steamId,
      name: alert.Name,
      team: alert.Team,
      score: alert.Score,
      reason: alert.Reason,
      at: alert.CreatedAt.toISOString(),
    });
  } catch {
    // Nothing to do about it here.
  }

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
