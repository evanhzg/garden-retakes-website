import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Toggle: the composite primary key makes a double-like impossible. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to like a clip." }, { status: 401 });

  const clipId = Number(params.id);
  if (!Number.isInteger(clipId)) return NextResponse.json({ error: "bad clip" }, { status: 400 });

  const steamId = BigInt(session.steamId);
  const existing = await prisma.feedClipLike.findUnique({
    where: { ClipId_SteamId: { ClipId: clipId, SteamId: steamId } },
  });

  if (existing) {
    await prisma.feedClipLike.delete({ where: { ClipId_SteamId: { ClipId: clipId, SteamId: steamId } } });
  } else {
    await prisma.feedClipLike.create({ data: { ClipId: clipId, SteamId: steamId } });
  }

  const likes = await prisma.feedClipLike.count({ where: { ClipId: clipId } });
  return NextResponse.json({ ok: true, liked: !existing, likes });
}
