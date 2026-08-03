import "server-only";
import { prisma } from "@/lib/db";
import { resolveNames, nameFrom } from "@/lib/names";
import { resolveAvatars } from "@/lib/avatars";

// One clip, resolved the same way the feed list resolves them.
//
// The shareable page and the embed both need a single clip by id, and both need
// the author worked out with the same rules the feed uses — a site profile
// wins, then the in-game name the demo carried, then the raw id. Doing that
// twice would let the two drift apart.

export type Variant = { name: string; height: number; url: string };

export type SharedClip = {
  id: number;
  steamId: string;
  author: string;
  authorIsUser: boolean;
  avatar?: string;
  title: string;
  description: string | null;
  kind: string;
  source: string;
  thumb: string | null;
  variants: Variant[];
  durationSec: number | null;
  createdAt: string;
  likes: number;
  comments: number;
};

/** Renditions for a clip, best first, whatever it is hosted on. */
export function variantsOf(kind: string, source: string, raw: string | null): Variant[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Variant[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // Fall through to the single-source form.
    }
  }
  if (kind === "upload") return [{ name: "Source", height: 0, url: `/api/feed/video/${encodeURIComponent(source)}` }];
  if (kind === "r2") return [{ name: "Source", height: 0, url: source }];
  return [];
}

export async function getSharedClip(id: number): Promise<SharedClip | null> {
  if (!Number.isInteger(id) || id <= 0) return null;

  let clip;
  try {
    clip = await prisma.feedClip.findUnique({
      where: { Id: id },
      include: { _count: { select: { Likes: true, Comments: true } } },
    });
  } catch {
    // Feed tables not installed yet.
    return null;
  }
  if (!clip) return null;

  const sid = clip.SteamId.toString();
  const isUser =
    (await prisma.playerProfile.findUnique({ where: { SteamId: clip.SteamId }, select: { SteamId: true } })) !== null;

  const [names, avatars] = await Promise.all([resolveNames([clip.SteamId]), resolveAvatars([clip.SteamId])]);

  return {
    id: clip.Id,
    steamId: sid,
    author: isUser ? nameFrom(names, clip.SteamId) : clip.PlayerName || nameFrom(names, clip.SteamId),
    authorIsUser: isUser,
    avatar: isUser ? avatars[sid] : undefined,
    title: clip.Title,
    description: clip.Description,
    kind: clip.Kind,
    source: clip.Source,
    thumb: clip.Thumb,
    variants: variantsOf(clip.Kind, clip.Source, clip.Variants),
    durationSec: clip.DurationSec,
    createdAt: clip.CreatedAt.toISOString(),
    likes: clip._count.Likes,
    comments: clip._count.Comments,
  };
}

/** Absolute origin, which link previews require — they cannot resolve /paths. */
export const siteOrigin = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || "https://retakes.fr").replace(/\/$/, "");

export const absolute = (url: string) => (/^https?:\/\//i.test(url) ? url : `${siteOrigin()}${url}`);
