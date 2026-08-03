import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Editing and removing a clip.
//
// Who may act on one: the person the clip belongs to - the uploader for a
// direct post, the player whose highlight it is for a pipeline clip, which the
// single SteamId column captures either way - and moderators.
//
// Reassigning that id is moderator-only, since it hands edit rights to whoever
// it points at.
//
// The video itself is not deleted from R2 here. Clip rows are cheap to recreate
// by re-publishing, and a DELETE that also wiped the object would make an
// accidental removal unrecoverable. Bucket cleanup is a separate, deliberate job.

type Actor = { canEdit: boolean; isAdmin: boolean; who: string };

async function actorFor(clipId: number, keyParam: string | null): Promise<{ clip: Awaited<ReturnType<typeof prisma.feedClip.findUnique>>; actor: Actor }> {
  const clip = await prisma.feedClip.findUnique({ where: { Id: clipId } });
  const session = getSession();
  const ctx = await getAdminContext(keyParam);
  const isAdmin = ctx.level >= AdminLevel.Moderator;

  if (!clip) return { clip, actor: { canEdit: false, isAdmin, who: "" } };

  // A clip carries one SteamID64, and it means the same thing either way: for
  // an upload it is who posted it, for a pipeline clip it is whose play it is.
  // So "the author" and "the player" are one check, not two.
  const me = session?.steamId ?? null;
  const isOwner = me !== null && clip.SteamId.toString() === me;

  return {
    clip,
    actor: {
      canEdit: isAdmin || isOwner,
      isAdmin,
      who: ctx.viaKey ? "Web Key" : (session?.name ?? me ?? "unknown"),
    },
  };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const keyParam = new URL(req.url).searchParams.get("key");
  const { clip, actor } = await actorFor(id, keyParam);
  if (!clip) return NextResponse.json({ error: "No such clip." }, { status: 404 });
  if (!actor.canEdit) return NextResponse.json({ error: "Not yours to edit." }, { status: 403 });

  let body: { title?: string; description?: string | null; steamId?: string; playerName?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, 140);
    if (!title) return NextResponse.json({ error: "A clip needs a title." }, { status: 400 });
    data.Title = title;
  }
  if (body.description !== undefined) {
    const d = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
    data.Description = d || null;
  }
  if (typeof body.playerName === "string") {
    data.PlayerName = body.playerName.trim().slice(0, 64) || null;
  }

  // Reassigning whose play it is hands edit rights to that person, so only
  // moderators may do it.
  if (typeof body.steamId === "string" && body.steamId.trim()) {
    if (!actor.isAdmin) {
      return NextResponse.json({ error: "Only a moderator can change who a clip belongs to." }, { status: 403 });
    }
    if (!/^\d{17}$/.test(body.steamId.trim())) {
      return NextResponse.json({ error: "That is not a SteamID64." }, { status: 400 });
    }
    data.SteamId = BigInt(body.steamId.trim());
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  await prisma.feedClip.update({ where: { Id: id }, data });

  if (actor.isAdmin) {
    const ctx = await getAdminContext(keyParam);
    await logAdminAction(ctx, "clip.edit", undefined, `#${id}: ${Object.keys(data).join(", ")}`);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const keyParam = new URL(req.url).searchParams.get("key");
  const { clip, actor } = await actorFor(id, keyParam);
  if (!clip) return NextResponse.json({ error: "No such clip." }, { status: 404 });
  if (!actor.canEdit) return NextResponse.json({ error: "Not yours to remove." }, { status: 403 });

  // Likes and comments cascade via the foreign keys.
  await prisma.feedClip.delete({ where: { Id: id } });

  if (actor.isAdmin) {
    const ctx = await getAdminContext(keyParam);
    await logAdminAction(ctx, "clip.delete", undefined, `#${id} "${clip.Title}"`);
  }

  return NextResponse.json({ ok: true });
}
