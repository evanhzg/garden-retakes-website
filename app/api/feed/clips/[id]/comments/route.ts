import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const clipId = Number(params.id);
  if (!Number.isInteger(clipId)) return NextResponse.json({ error: "bad clip" }, { status: 400 });

  const rows = await prisma.feedClipComment.findMany({
    where: { ClipId: clipId },
    orderBy: { AtUtc: "asc" },
    take: 200,
  });

  const ids = rows.map((r) => r.SteamId);
  const [names, avatars] = await Promise.all([resolveNames(ids), resolveAvatars(ids)]);
  const session = getSession();

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.Id,
      steamId: r.SteamId.toString(),
      author: nameFrom(names, r.SteamId),
      avatar: avatars[r.SteamId.toString()],
      body: r.Body,
      at: r.AtUtc.toISOString(),
      mine: session?.steamId === r.SteamId.toString(),
    })),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });

  const clipId = Number(params.id);
  if (!Number.isInteger(clipId)) return NextResponse.json({ error: "bad clip" }, { status: 400 });

  const body = String(((await req.json().catch(() => ({}))) as { body?: string }).body ?? "")
    .trim()
    .slice(0, 500);
  if (!body) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  const clip = await prisma.feedClip.findUnique({ where: { Id: clipId } });
  if (!clip) return NextResponse.json({ error: "That clip is gone." }, { status: 404 });

  const row = await prisma.feedClipComment.create({
    data: { ClipId: clipId, SteamId: BigInt(session.steamId), Body: body },
  });
  return NextResponse.json({ ok: true, id: row.Id });
}

/** Delete your own comment; moderators can delete anyone's. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const commentId = Number(new URL(req.url).searchParams.get("comment"));
  if (!Number.isInteger(commentId)) return NextResponse.json({ error: "bad comment" }, { status: 400 });

  const row = await prisma.feedClipComment.findUnique({ where: { Id: commentId } });
  if (!row || row.ClipId !== Number(params.id)) {
    return NextResponse.json({ error: "No such comment." }, { status: 404 });
  }

  const ctx = await getAdminContext(null);
  const mine = row.SteamId.toString() === session.steamId;
  if (!mine && ctx.level < AdminLevel.Moderator) {
    return NextResponse.json({ error: "Not yours to delete." }, { status: 403 });
  }

  await prisma.feedClipComment.delete({ where: { Id: commentId } });
  return NextResponse.json({ ok: true });
}
