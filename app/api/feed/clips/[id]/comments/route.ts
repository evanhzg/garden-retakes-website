import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";
import { notify, mentionedIds, plainText } from "@/lib/notifications";

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
  const session = getSession();
  const [names, avatars, likeRows, myLikes] = await Promise.all([
    resolveNames(ids),
    resolveAvatars(ids),
    prisma.feedClipCommentLike.groupBy({
      by: ["CommentId"],
      where: { CommentId: { in: rows.map((r) => r.Id) } },
      _count: { CommentId: true },
    }).catch(() => [] as { CommentId: number; _count: { CommentId: number } }[]),
    session
      ? prisma.feedClipCommentLike
          .findMany({ where: { SteamId: BigInt(session.steamId), CommentId: { in: rows.map((r) => r.Id) } }, select: { CommentId: true } })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const likeCount = new Map(likeRows.map((l) => [l.CommentId, l._count.CommentId]));
  const likedByMe = new Set(myLikes.map((l) => l.CommentId));

  // Names for anyone mentioned inside the bodies, so the client can render
  // <@id> as a person without a lookup per comment.
  const mentioned = Array.from(new Set(rows.flatMap((r) => mentionedIds(r.Body))));
  const mentionNames: Record<string, string> = {};
  if (mentioned.length > 0) {
    const mIds = mentioned.map((m) => BigInt(m));
    const mNames = await resolveNames(mIds);
    for (const m of mentioned) mentionNames[m] = nameFrom(mNames, BigInt(m));
  }

  return NextResponse.json({
    mentionNames,
    comments: rows.map((r) => ({
      id: r.Id,
      steamId: r.SteamId.toString(),
      author: nameFrom(names, r.SteamId),
      avatar: avatars[r.SteamId.toString()],
      body: r.Body,
      likes: likeCount.get(r.Id) ?? 0,
      likedByMe: likedByMe.has(r.Id),
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

  const me = BigInt(session.steamId);
  const row = await prisma.feedClipComment.create({
    data: { ClipId: clipId, SteamId: me, Body: body },
  });

  // Mentions first, then the clip's owner — someone mentioned in a comment on
  // their own clip should get one notification, not two.
  const mentions = mentionedIds(body).filter((id) => id !== session.steamId);
  const everyone = await resolveNames([me, ...mentions.map((m) => BigInt(m))]);
  const author = nameFrom(everyone, me);
  const preview = plainText(body, new Map(mentions.map((m) => [m, nameFrom(everyone, BigInt(m))])));

  for (const id of mentions) {
    await notify({
      steamId: BigInt(id),
      actorSteamId: me,
      type: "CLIP_MENTION",
      content: `${author} mentioned you: ${preview.slice(0, 120)}`,
      actionUrl: `/feed?clip=${clipId}`,
    });
  }

  if (!mentions.includes(clip.SteamId.toString())) {
    await notify({
      steamId: clip.SteamId,
      actorSteamId: me,
      type: "CLIP_COMMENT",
      content: `${author} commented on "${clip.Title}": ${preview.slice(0, 120)}`,
      actionUrl: `/feed?clip=${clipId}`,
    });
  }

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
