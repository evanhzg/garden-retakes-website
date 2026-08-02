import path from "node:path";

/**
 * Feed helpers: clip storage, YouTube parsing and the CS2 update stream.
 */

export const CLIP_DIR = path.join(process.cwd(), "data", "clips");

/** Uploads above this are refused. Long clips belong on YouTube. */
export const MAX_CLIP_BYTES = 100 * 1024 * 1024;

export const CLIP_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export {
  isRange,
  isSort,
  rangeStart,
  youtubeEmbed,
  youtubeId,
  youtubeThumb,
  type FeedRange,
  type FeedSort,
} from "@/lib/feedShared";

// ────────────────────────────────────────────────────────────── CS2 updates

export type Cs2Update = {
  id: string;
  title: string;
  url: string;
  date: string;
  summary: string;
  source: string;
};

/** Steam's news feed needs no API key, so this works out of the box. */
const NEWS_URL =
  "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=15&maxlength=600";

let newsCache: { at: number; items: Cs2Update[] } | null = null;
const NEWS_TTL_MS = 10 * 60 * 1000;

/** Strip Steam's bbcode so a summary can be rendered as plain text. */
function clean(text: string): string {
  return text
    .replace(/\[\/?[^\]]+\]/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function cs2Updates(): Promise<Cs2Update[]> {
  if (newsCache && Date.now() - newsCache.at < NEWS_TTL_MS) return newsCache.items;

  try {
    const res = await fetch(NEWS_URL, { cache: "no-store" });
    if (!res.ok) return newsCache?.items ?? [];
    const json = (await res.json()) as {
      appnews?: { newsitems?: { gid: string; title: string; url: string; date: number; contents: string; feedlabel: string }[] };
    };

    const items = (json.appnews?.newsitems ?? []).map((n) => ({
      id: String(n.gid),
      title: n.title,
      url: n.url,
      // Steam sends seconds.
      date: new Date(n.date * 1000).toISOString(),
      summary: clean(n.contents).slice(0, 320),
      source: n.feedlabel,
    }));

    newsCache = { at: Date.now(), items };
    return items;
  } catch {
    // A Steam outage shows the last good list rather than an empty feed.
    return newsCache?.items ?? [];
  }
}
