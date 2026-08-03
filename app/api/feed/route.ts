import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";
import { parseTags } from "@/lib/feedShared";
import {
  CLIP_DIR,
  CLIP_TYPES,
  MAX_CLIP_BYTES,
  isRange,
  isSort,
  rangeStart,
  youtubeId,
  youtubeThumb,
} from "@/lib/feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET  /api/feed?range=week&sort=likes&steamId=…   list clips
// POST /api/feed                                    publish one

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rangeRaw = url.searchParams.get("range") ?? "all";
  const sortRaw = url.searchParams.get("sort") ?? "new";
  const range = isRange(rangeRaw) ? rangeRaw : "all";
  const sort = isSort(sortRaw) ? sortRaw : "new";
  const steamId = url.searchParams.get("steamId");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const kind = url.searchParams.get("kind");
  const tag = (url.searchParams.get("tag") ?? "").trim();
  const take = Math.min(60, Math.max(1, Number(url.searchParams.get("take") ?? 30)));

  // An unlisted clip is one the pipeline made from a /clip mark: it has a
  // machine-written title nobody chose, so it stays out of the feed until its
  // owner names it. They still see their own, to do exactly that.
  const me = getSession()?.steamId ?? null;
  const visibility = me
    ? { OR: [{ Unlisted: false }, { SteamId: BigInt(me) }] }
    : { Unlisted: false };

  const since = rangeStart(range);
  const where = {
    ...visibility,
    ...(since ? { CreatedAt: { gte: since } } : {}),
    ...(steamId && /^\d{17}$/.test(steamId) ? { SteamId: BigInt(steamId) } : {}),
    ...(kind && ["upload", "youtube", "r2"].includes(kind) ? { Kind: kind } : {}),
  };

  let clips;
  try {
    clips = await prisma.feedClip.findMany({
      where,
      // "Most liked" still has to break ties by date, or equally-liked clips
      // shuffle between requests.
      orderBy:
        sort === "likes"
          ? [{ Likes: { _count: "desc" } }, { CreatedAt: "desc" }]
          : sort === "comments"
            ? [{ Comments: { _count: "desc" } }, { CreatedAt: "desc" }]
            : { CreatedAt: "desc" },
      take,
      include: { _count: { select: { Likes: true, Comments: true } } },
    });
  } catch {
    // The tables are created by sql/feed.sql; say so rather than 500.
    return NextResponse.json({ error: "Feed tables are missing — run sql/feed.sql.", clips: [] }, { status: 503 });
  }

  const session = getSession();
  const ids = clips.map((c) => c.SteamId);
  // Which of these SteamIDs actually have a profile here. A clip cut from a
  // demo often features someone who has never visited the site, and linking to
  // an empty profile is worse than not linking at all.
  const known = new Set(
    (
      await prisma.playerProfile.findMany({
        where: { SteamId: { in: ids } },
        select: { SteamId: true },
      })
    ).map((p) => p.SteamId.toString())
  );

  const [names, avatars, myLikes] = await Promise.all([
    resolveNames(ids),
    resolveAvatars(ids),
    session
      ? prisma.feedClipLike.findMany({
          where: { SteamId: BigInt(session.steamId), ClipId: { in: clips.map((c) => c.Id) } },
          select: { ClipId: true },
        })
      : Promise.resolve([]),
  ]);
  const liked = new Set(myLikes.map((l) => l.ClipId));

  const rows = clips.map((c) => {
    const sid = c.SteamId.toString();
    const isUser = known.has(sid);
    // A site profile wins; otherwise the in-game name the demo carried; only
    // then the raw id, which at least identifies them.
    const author = isUser ? nameFrom(names, c.SteamId) : c.PlayerName || nameFrom(names, c.SteamId);
    return {
      id: c.Id,
      steamId: sid,
      author,
      authorIsUser: isUser,
      avatar: isUser ? avatars[sid] : undefined,
      title: c.Title,
      description: c.Description,
      kind: c.Kind,
      source: c.Source,
      thumb: c.Thumb,
      variants: c.Variants,
      durationSec: c.DurationSec,
      createdAt: c.CreatedAt.toISOString(),
      likes: c._count.Likes,
      comments: c._count.Comments,
      likedByMe: liked.has(c.Id),
      unlisted: c.Unlisted,
      tags: parseTags(c.Tags),
      sessionId: c.SessionId,
      mine: session?.steamId === sid,
      canEdit: session?.steamId === sid,
    };
  });

  // Free-text search happens here rather than in SQL: the name shown may come
  // from a profile, a name override or the demo, none of which the clip row
  // knows about on its own.
  // Tag filtering happens here rather than in SQL: tags are a comma list, so a
  // LIKE would match "clutchfail" when asked for "clutch".
  const tagged = tag ? rows.filter((r) => r.tags.includes(tag)) : rows;

  const filtered = q
    ? tagged.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          r.author.toLowerCase().includes(q) ||
          r.steamId.includes(q)
      )
    : tagged;

  return NextResponse.json({ clips: filtered });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Sign in to post a clip." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a multipart form." }, { status: 400 });

  const title = String(form.get("title") ?? "").trim().slice(0, 140);
  const description = String(form.get("description") ?? "").trim().slice(0, 500) || null;
  if (!title) return NextResponse.json({ error: "Give the clip a title." }, { status: 400 });

  const steamId = BigInt(session.steamId);
  const youtubeRaw = String(form.get("youtube") ?? "").trim();
  const file = form.get("file");

  // ---- YouTube ----
  if (youtubeRaw) {
    const id = youtubeId(youtubeRaw);
    if (!id) return NextResponse.json({ error: "That does not look like a YouTube link." }, { status: 400 });
    const clip = await prisma.feedClip.create({
      data: { SteamId: steamId, Title: title, Description: description, Kind: "youtube", Source: id, Thumb: youtubeThumb(id) },
    });
    return NextResponse.json({ ok: true, id: clip.Id });
  }

  // ---- Upload ----
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a video or paste a YouTube link." }, { status: 400 });
  }
  const ext = CLIP_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: `Unsupported format (${file.type || "unknown"}). Use MP4, WebM or MOV.` }, { status: 415 });
  }
  if (file.size > MAX_CLIP_BYTES) {
    return NextResponse.json(
      { error: `That clip is ${(file.size / 1024 / 1024).toFixed(0)} MB; the limit is ${MAX_CLIP_BYTES / 1024 / 1024} MB. Put longer videos on YouTube and paste the link.` },
      { status: 413 }
    );
  }

  const name = `${session.steamId}-${Date.now()}.${ext}`;
  await fs.mkdir(CLIP_DIR, { recursive: true });
  await fs.writeFile(path.join(CLIP_DIR, name), Buffer.from(await file.arrayBuffer()));

  const clip = await prisma.feedClip.create({
    data: { SteamId: steamId, Title: title, Description: description, Kind: "upload", Source: name, Bytes: file.size },
  });
  return NextResponse.json({ ok: true, id: clip.Id });
}
