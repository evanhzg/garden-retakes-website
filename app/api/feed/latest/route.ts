import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "Is there anything new?" — polled by the feed every half minute.
//
// Deliberately not the feed itself: answering this costs one indexed row, so
// an open tab can ask often without the cost of rebuilding a page of clips,
// resolving names and avatars and counting likes for each one.
//
// Newest id alone is not enough. Deleting a clip leaves the newest id
// unchanged, and the tab would keep showing something that is gone, so the
// total goes with it.

export async function GET() {
  try {
    const [newest, total] = await Promise.all([
      prisma.feedClip.findFirst({ orderBy: { Id: "desc" }, select: { Id: true } }),
      prisma.feedClip.count(),
    ]);
    return NextResponse.json(
      { latestId: newest?.Id ?? 0, total },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    // Feed tables missing — the poller treats this as "nothing new".
    return NextResponse.json({ latestId: 0, total: 0 }, { status: 503 });
  }
}
