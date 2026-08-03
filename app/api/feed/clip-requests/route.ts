import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The /clip queue.
//
// GET with the pipeline key   — everything still to cut, so the local run can
//                               drain it.
// GET signed in               — only your own marks, for "3 clips being made".

function keyMatches(req: Request): boolean {
  const given = req.headers.get("x-api-key");
  const accepted = [process.env.ADMIN_KEY, process.env.INVSIM_API_KEY].filter(Boolean);
  return Boolean(given && accepted.includes(given));
}

export async function GET(req: Request) {
  if (keyMatches(req)) {
    const rows = await prisma.gardenClipRequest.findMany({
      where: { Status: { in: ["pending", "processing"] } },
      orderBy: { CreatedAt: "asc" },
      take: 100,
    });
    return NextResponse.json({
      requests: rows.map((r) => ({
        id: r.Id,
        steamId: r.SteamId.toString(),
        playerName: r.PlayerName,
        map: r.Map,
        demoFile: r.DemoFile,
        sessionId: r.SessionId,
        tick: r.Tick,
        durationSec: r.DurationSec,
        status: r.Status,
      })),
    });
  }

  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const rows = await prisma.gardenClipRequest.findMany({
    where: { SteamId: BigInt(session.steamId) },
    orderBy: { CreatedAt: "desc" },
    take: 25,
  });
  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.Id,
      map: r.Map,
      sessionId: r.SessionId,
      durationSec: r.DurationSec,
      status: r.Status,
      note: r.Note,
      clipId: r.ClipId,
      createdAt: r.CreatedAt.toISOString(),
    })),
  });
}
