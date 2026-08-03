import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NOTIFICATION_META } from "@/lib/notifications";
import { cs2Updates } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET  — your notifications, targeted and global merged.
// POST — mark everything read.

type Item = {
  id: string;
  type: string;
  icon: string;
  content: string;
  url: string | null;
  at: string;
  read: boolean;
};

/** Nothing older than this is worth showing as "new". */
const WINDOW_DAYS = 14;

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ items: [], unread: 0, signedIn: false });

  const me = BigInt(session.steamId);
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);

  const [rows, profile] = await Promise.all([
    prisma.webNotification.findMany({
      where: { SteamId: me, CreatedAtUtc: { gte: since } },
      orderBy: { CreatedAtUtc: "desc" },
      take: 50,
    }),
    prisma.gardenWebProfile.findUnique({ where: { SteamId: me }, select: { NotifSeenAtUtc: true } }),
  ]);

  const seenAt = profile?.NotifSeenAtUtc ?? new Date(0);

  const items: Item[] = rows.map((r) => ({
    id: `n${r.Id}`,
    type: r.Type,
    icon: NOTIFICATION_META[r.Type]?.icon ?? "•",
    content: r.Content,
    url: r.ActionUrl,
    at: r.CreatedAtUtc.toISOString(),
    read: r.IsRead,
  }));

  // Global events, derived rather than fanned out to every player.
  const [clips, updates] = await Promise.all([
    prisma.feedClip
      .findMany({
        where: { CreatedAt: { gte: since }, Unlisted: false, SteamId: { not: me } },
        orderBy: { CreatedAt: "desc" },
        take: 10,
        select: { Id: true, Title: true, CreatedAt: true },
      })
      .catch(() => []),
    cs2Updates().catch(() => []),
  ]);

  for (const c of clips) {
    items.push({
      id: `clip${c.Id}`,
      type: "CLIP_POSTED",
      icon: NOTIFICATION_META.CLIP_POSTED.icon,
      content: c.Title,
      // The feed with that clip opened, rather than the bare share page —
      // arriving somewhere with no navigation reads as a broken link.
      url: `/feed?clip=${c.Id}`,
      at: c.CreatedAt.toISOString(),
      read: c.CreatedAt <= seenAt,
    });
  }

  for (const u of (updates ?? []).slice(0, 5)) {
    const at = new Date(u.date);
    if (at < since) continue;
    items.push({
      id: `cs2${u.id}`,
      type: "CS2_UPDATE",
      icon: NOTIFICATION_META.CS2_UPDATE.icon,
      content: u.title,
      url: u.url,
      at: at.toISOString(),
      read: at <= seenAt,
    });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json({
    items: items.slice(0, 40),
    unread: items.filter((i) => !i.read).length,
    signedIn: true,
  });
}

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const me = BigInt(session.steamId);
  const now = new Date();

  await Promise.all([
    prisma.webNotification.updateMany({ where: { SteamId: me, IsRead: false }, data: { IsRead: true } }),
    // One timestamp covers every global event at once, which is the whole
    // reason they are not rows.
    prisma.gardenWebProfile.upsert({
      where: { SteamId: me },
      create: { SteamId: me, NotifSeenAtUtc: now },
      update: { NotifSeenAtUtc: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
