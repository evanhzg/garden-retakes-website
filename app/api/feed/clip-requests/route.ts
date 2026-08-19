import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";

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
        round: r.Round,
        durationSec: r.DurationSec,
        status: r.Status,
      })),
    });
  }

  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // The management page reads the same route with ?all=1, which for a
  // moderator means everybody's marks. Without it, and for everyone else, this
  // is still exactly what it was: your own.
  const url = new URL(req.url);
  const wantsAll = url.searchParams.get("all") === "1";
  const ctx = await getAdminContext(null);
  const asModerator = wantsAll && ctx.level >= AdminLevel.Moderator;

  const rows = await prisma.gardenClipRequest.findMany({
    where: asModerator ? {} : { SteamId: BigInt(session.steamId) },
    orderBy: { CreatedAt: "desc" },
    take: asModerator ? 400 : 200,
  });

  // Titles and durations of the clips these produced, so the page can show what
  // a mark actually became rather than only that it finished.
  const clipIds = rows.map((r) => r.ClipId).filter((id): id is number => typeof id === "number");
  const clips = clipIds.length
    ? await prisma.feedClip.findMany({
        where: { Id: { in: clipIds } },
        select: { Id: true, Title: true, DurationSec: true, Unlisted: true },
      })
    : [];
  const byId = new Map(clips.map((c) => [c.Id, c]));

  return NextResponse.json({
    mine: !asModerator,
    requests: rows.map((r) => ({
      id: r.Id.toString(),
      map: r.Map,
      round: r.Round,
      sessionId: r.SessionId,
      durationSec: r.DurationSec,
      status: r.Status,
      note: r.Note,
      clipId: r.ClipId,
      clipTitle: r.ClipId ? (byId.get(r.ClipId)?.Title ?? null) : null,
      clipDurationSec: r.ClipId ? (byId.get(r.ClipId)?.DurationSec ?? null) : null,
      clipUnlisted: r.ClipId ? (byId.get(r.ClipId)?.Unlisted ?? false) : false,
      playerName: r.PlayerName,
      steamId: r.SteamId.toString(),
      mine: r.SteamId.toString() === session.steamId,
      createdAt: r.CreatedAt.toISOString(),
    })),
  });
}
