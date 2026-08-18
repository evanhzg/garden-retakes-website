import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/feed/clip-requests/<id> — the pipeline reporting progress, or the
// person who made the mark managing it.
//
// Two callers with different rights, deliberately not one permission:
//
//   with the pipeline key  — sets any status, and reports the clip it produced.
//                            This is the local run talking, not a browser.
//   signed in as the owner — may retry a failed mark or cancel one that has not
//                            been cut yet, and nothing else. A player must not
//                            be able to mark their own request "done" and point
//                            it at somebody else's clip.
//
// DELETE removes a mark. Owner or moderator; the published clip, if there is
// one, is left alone — deleting the request is tidying a queue, not retracting
// a video, and those have different undo costs.

function keyMatches(req: Request): boolean {
  const given = req.headers.get("x-api-key");
  const accepted = [process.env.ADMIN_KEY, process.env.INVSIM_API_KEY].filter(Boolean);
  return Boolean(given && accepted.includes(given));
}

/** The two statuses an owner is allowed to move a mark to, and from where. */
const OWNER_TRANSITIONS: Record<string, string[]> = {
  // Retry: a mark the pipeline gave up on goes back in the queue.
  pending: ["failed"],
  // Cancel: only before anything has been cut. Cancelling a finished mark
  // would leave a published clip with nothing pointing at it.
  cancelled: ["pending", "failed"],
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: { status?: string; note?: string; clipId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const status = String(body.status ?? "");

  if (keyMatches(req)) {
    if (!["pending", "processing", "done", "failed"].includes(status)) {
      return NextResponse.json({ error: "bad status" }, { status: 400 });
    }

    const row = await prisma.gardenClipRequest.update({
      where: { Id: id },
      data: {
        Status: status,
        Note: body.note?.slice(0, 500) ?? null,
        ClipId: Number.isInteger(body.clipId) ? body.clipId : undefined,
        ProcessedAt: status === "done" || status === "failed" ? new Date() : undefined,
      },
    });

    // The moment a request is linked to the clip it produced is the moment we
    // know both halves, so the map moves across here.
    //
    // /api/feed/register accepts a map field too, but the pipeline that calls it
    // lives outside this repository and does not send one yet. Doing it here as
    // well means clips cut from /clip marks carry their map today, without
    // waiting on a change somewhere we cannot make — and the `??` means the
    // pipeline's own value wins whenever it starts sending one.
    if (Number.isInteger(body.clipId) && row.Map) {
      try {
        await prisma.feedClip.updateMany({
          where: { Id: body.clipId, Map: null },
          data: { Map: row.Map.slice(0, 64) },
        });
      } catch {
        // A clip row that is not there yet is not a reason to fail the status
        // report — the queue state is what the pipeline is actually waiting on.
      }
    }

    return NextResponse.json({ ok: true });
  }

  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const row = await prisma.gardenClipRequest.findUnique({ where: { Id: id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ctx = await getAdminContext(null);
  const isModerator = ctx.level >= AdminLevel.Moderator;
  if (!isModerator && row.SteamId.toString() !== session.steamId) {
    return NextResponse.json({ error: "not yours" }, { status: 403 });
  }

  const allowedFrom = OWNER_TRANSITIONS[status];
  if (!allowedFrom) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }
  if (!allowedFrom.includes(row.Status)) {
    return NextResponse.json(
      { error: `cannot go from ${row.Status} to ${status}` },
      { status: 409 },
    );
  }

  await prisma.gardenClipRequest.update({
    where: { Id: id },
    data: {
      Status: status,
      // A retry clears the failure note, which otherwise sits there explaining
      // a problem that may no longer apply.
      Note: status === "pending" ? null : row.Note,
      ProcessedAt: status === "pending" ? null : new Date(),
    },
  });

  if (isModerator && row.SteamId.toString() !== session.steamId) {
    await logAdminAction(ctx, `clip-request ${status}`,
      { steamId: row.SteamId, name: row.PlayerName }, `#${id}`);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const row = await prisma.gardenClipRequest.findUnique({ where: { Id: id } });
  if (!row) return NextResponse.json({ ok: true });

  const ctx = await getAdminContext(null);
  const isModerator = ctx.level >= AdminLevel.Moderator;
  if (!isModerator && row.SteamId.toString() !== session.steamId) {
    return NextResponse.json({ error: "not yours" }, { status: 403 });
  }

  await prisma.gardenClipRequest.delete({ where: { Id: id } });

  if (isModerator && row.SteamId.toString() !== session.steamId) {
    await logAdminAction(ctx, "clip-request delete",
      { steamId: row.SteamId, name: row.PlayerName }, `#${id}`);
  }

  return NextResponse.json({ ok: true });
}
