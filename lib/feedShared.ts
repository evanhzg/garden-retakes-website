/**
 * Feed helpers with no Node dependencies, so both the browser and the server
 * can use them.
 *
 * lib/feed.ts imports node:path for the clip directory; importing anything from
 * it in a client component drags that into the browser bundle and fails the
 * build. The pure parts live here instead.
 */

export type FeedRange = "day" | "week" | "month" | "all";
export type FeedSort = "new" | "likes" | "comments" | "hot";

export const isRange = (v: string): v is FeedRange => ["day", "week", "month", "all"].includes(v);
export const isSort = (v: string): v is FeedSort => ["new", "likes", "comments", "hot"].includes(v);

/** Start of the window for a range, or null for all-time. */
export function rangeStart(range: FeedRange): Date | null {
  const days = range === "day" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 0;
  return days ? new Date(Date.now() - days * 86_400_000) : null;
}

/** One playable rendition of a clip. Mirrors VideoPlayer's own Variant. */
export type ClipVariant = { name: string; height: number; url: string };

/**
 * The playable sources for a clip, in the browser.
 *
 * `lib/feedClip.ts` has `variantsOf`, but that module is `server-only` — it
 * imports Prisma — so no client component can call it. Three of them had
 * therefore each inlined their own copy of this logic, and the copies had
 * already drifted: the profile's featured card did not know about `allstar`,
 * so an Allstar clip would render there with no sources at all.
 *
 * One copy, on the browser-safe side of the fence, which is what this module is
 * for.
 */
export function clipVariants(
  kind: string,
  source: string,
  raw: string | null | undefined,
  sourceLabel = "Source",
): ClipVariant[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ClipVariant[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // Fall through to the single-source form.
    }
  }

  if (kind === "upload") {
    return [{ name: sourceLabel, height: 0, url: `/api/feed/video/${encodeURIComponent(source)}` }];
  }
  // r2 and allstar both hold a direct https URL in Source.
  if (kind === "r2" || kind === "allstar") {
    return [{ name: sourceLabel, height: 0, url: source }];
  }

  // YouTube plays through its own embed, and anything unknown has nothing we
  // can hand to a <video>.
  return [];
}

/**
 * How good a clip is, for choosing what leads the feed.
 *
 * Reaction, decayed by age. Likes lead and comments break ties, which is the
 * formula the profile page already used for its featured clip
 * (components/profile/FeaturedClip.tsx) — promoted here so one definition of
 * "best" serves the whole site rather than each page inventing its own.
 *
 * The decay is the part that page did not need and the feed does. Without it
 * the most-liked clip of all time holds the hero for ever, and a hero that
 * never changes stops being looked at. A half-life means a very good old clip
 * and a good new one can trade places, which is what makes the top of the page
 * worth revisiting.
 */
export const HERO_HALF_LIFE_DAYS = 10;

export function clipScore(
  clip: { likes: number; comments: number; createdAt: string },
  now: number = Date.now(),
): number {
  const raw = clip.likes * 3 + clip.comments;
  if (raw <= 0) return 0;

  const ageDays = Math.max(0, (now - new Date(clip.createdAt).getTime()) / 86_400_000);
  // Guard against a clip dated in the future — a clock skew on the pipeline
  // box should not hand it the hero seat permanently.
  return raw * Math.pow(0.5, ageDays / HERO_HALF_LIFE_DAYS);
}

/**
 * The clips the hero shows: the best one, then the runners-up beside it.
 *
 * Returns nothing at all rather than a weak lead when no clip has any
 * reaction — a hero promoting a clip nobody has watched is worse than the page
 * simply starting at the grid.
 */
export function pickHero<T extends { likes: number; comments: number; createdAt: string }>(
  clips: T[],
  runnersUp = 4,
  now: number = Date.now(),
): { featured: T; rest: T[] } | null {
  const scored = clips
    .map((clip) => ({ clip, score: clipScore(clip, now) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  return {
    featured: scored[0].clip,
    rest: scored.slice(1, 1 + runnersUp).map((s) => s.clip),
  };
}

/**
 * Pull the 11-character video id out of any YouTube URL shape.
 *
 * Accepts watch?v=, youtu.be/, /shorts/, /embed/ and a bare id — people paste
 * whatever their browser gave them, and rejecting a valid link because it came
 * from the Shorts player would be its own small annoyance.
 */
export function youtubeId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;

  const v = url.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;

  const m = /^\/(shorts|embed|v|live)\/([\w-]{11})/.exec(url.pathname);
  return m ? m[2] : null;
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;

/**
 * Demo files the pipeline can take.
 *
 * Compressed is not just tolerated but preferred: FACEIT hands out .dem.gz and
 * a match packs to roughly 70% of its raw size, which is upload time for the
 * player and storage in the bucket. The pipeline unpacks whatever it gets, so
 * this only has to agree with what it knows how to read.
 */
export const DEMO_EXTENSIONS = [".dem", ".dem.gz", ".dem.bz2", ".dem.zst", ".dem.xz", ".zip", ".7z"];

export const DEMO_FILE_RE = /\.dem$|\.dem\.(gz|bz2|zst|zstd|xz)$|\.(zip|7z)$/i;

export const isDemoFile = (name: string) => DEMO_FILE_RE.test(name.trim());

/**
 * Clip tags.
 *
 * A fixed list rather than free text: tags are only worth having if two people
 * labelling the same thing pick the same word, and free tagging reliably
 * produces "ace", "ACE" and "1v5" for one clip. Colours are fixed here too so a
 * tag looks the same everywhere it appears.
 */
export const CLIP_TAGS = [
  { id: "ace", label: "Ace", colour: "#e8b53a" },
  { id: "clutch", label: "Clutch", colour: "#e8703a" },
  { id: "multikill", label: "Multi-kill", colour: "#d8564a" },
  { id: "sniper", label: "AWP", colour: "#7fbf5f" },
  { id: "knife", label: "Knife", colour: "#b58fd8" },
  { id: "nade", label: "Utility", colour: "#8bb8d8" },
  { id: "clutchfail", label: "Choke", colour: "#9b9797" },
  { id: "funny", label: "Funny", colour: "#e85fa8" },
  { id: "teamplay", label: "Teamplay", colour: "#5fc9c9" },
  { id: "allstar", label: "Allstar", colour: "#00a1ff" },
] as const;

export type ClipTagId = (typeof CLIP_TAGS)[number]["id"];

export const isClipTag = (v: string): v is ClipTagId => CLIP_TAGS.some((t) => t.id === v);

/** Stored as a comma-separated list; unknown values are dropped on the way in. */
export const parseTags = (raw: string | null | undefined): string[] =>
  (raw ?? "").split(",").map((t) => t.trim()).filter(isClipTag);

export const serialiseTags = (tags: string[]): string =>
  Array.from(new Set(tags.filter(isClipTag))).join(",").slice(0, 200);

export const tagColour = (id: string): string =>
  CLIP_TAGS.find((t) => t.id === id)?.colour ?? "#9b9797";

export const tagLabel = (id: string): string =>
  CLIP_TAGS.find((t) => t.id === id)?.label ?? id;
