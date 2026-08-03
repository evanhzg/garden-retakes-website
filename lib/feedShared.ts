/**
 * Feed helpers with no Node dependencies, so both the browser and the server
 * can use them.
 *
 * lib/feed.ts imports node:path for the clip directory; importing anything from
 * it in a client component drags that into the browser bundle and fails the
 * build. The pure parts live here instead.
 */

export type FeedRange = "day" | "week" | "month" | "all";
export type FeedSort = "new" | "likes" | "comments";

export const isRange = (v: string): v is FeedRange => ["day", "week", "month", "all"].includes(v);
export const isSort = (v: string): v is FeedSort => ["new", "likes", "comments"].includes(v);

/** Start of the window for a range, or null for all-time. */
export function rangeStart(range: FeedRange): Date | null {
  const days = range === "day" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 0;
  return days ? new Date(Date.now() - days * 86_400_000) : null;
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
