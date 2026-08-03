import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Toggle a like on one comment. The unique key makes double-liking impossible. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to like." }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad comment" }, { status: 400 });

  const steamId = BigInt(session.steamId);
  const existing = await prisma.feedClipCommentLike.findUnique({
    where: { CommentId_SteamId: { CommentId: id, SteamId: steamId } },
  });

  if (existing) {
    await prisma.feedClipCommentLike.delete({ where: { CommentId_SteamId: { CommentId: id, SteamId: steamId } } });
  } else {
    await prisma.feedClipCommentLike.create({ data: { CommentId: id, SteamId: steamId } });
  }

  const likes = await prisma.feedClipCommentLike.count({ where: { CommentId: id } });
  return NextResponse.json({ ok: true, liked: !existing, likes });
}
