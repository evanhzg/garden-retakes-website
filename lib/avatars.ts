import path from "node:path";
import { prisma } from "@/lib/db";

/**
 * Steam avatar resolution with a database cache.
 *
 * Avatars were previously read from `/public/<steamId>_pp.png`, a local file that
 * exists for almost nobody, so most of the site fell back to the placeholder.
 * The real source is Steam's GetPlayerSummaries, which the login flow already
 * calls — but only for the person signing in. Ladder rows, team lists and match
 * pages are full of players who have never visited the site at all.
 *
 * So: read from GardenWebProfile.AvatarUrl, batch anything missing to Steam, and
 * persist it. One page of ladder (100 rows) costs at most one Steam call, since
 * GetPlayerSummaries takes 100 ids per request.
 */

const STEAM_BATCH = 100; // hard API limit, not a tuning knob
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_AVATAR = "/default_pp.png";

/** Where a cropped upload from the profile settings modal is served from. */
export const CUSTOM_AVATAR_PREFIX = "/api/profile/avatar/";

/**
 * On-disk home for uploaded avatars.
 *
 * Lives here rather than in the route file because App Router route modules may
 * only export handlers and route config — a stray constant export breaks the
 * build.
 */
export const AVATAR_DIR = path.join(process.cwd(), "data", "avatars");

export const isCustomAvatar = (url: string | null | undefined): boolean =>
  Boolean(url && url.startsWith(CUSTOM_AVATAR_PREFIX));

type Row = { SteamId: bigint; AvatarUrl: string | null; UpdatedAt: Date };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchFromSteam(ids: string[]): Promise<Map<string, string>> {
  const key = process.env.STEAM_API_KEY;
  const found = new Map<string, string>();
  if (!key || ids.length === 0) return found;

  for (const group of chunk(ids, STEAM_BATCH)) {
    try {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${group.join(",")}`,
        { cache: "no-store" },
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const p of data?.response?.players ?? []) {
        if (p?.steamid && p?.avatarfull) found.set(String(p.steamid), String(p.avatarfull));
      }
    } catch {
      // A Steam outage degrades to the placeholder rather than failing the page.
    }
  }
  return found;
}

/**
 * Maps each requested SteamID64 to an avatar URL, falling back to the local
 * placeholder. Never throws — a failure here should not take a page down.
 */
export async function resolveAvatars(steamIds: (string | bigint)[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(steamIds.map(String).filter((s) => /^\d{17}$/.test(s))));
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;

  let rows: Row[] = [];
  try {
    rows = await prisma.gardenWebProfile.findMany({
      where: { SteamId: { in: ids.map((i) => BigInt(i)) } },
      select: { SteamId: true, AvatarUrl: true, UpdatedAt: true },
    });
  } catch {
    // Table missing or DB down — fall through to Steam so the page still renders.
  }

  const cached = new Map(rows.map((r) => [r.SteamId.toString(), r]));
  const stale: string[] = [];
  const cutoff = Date.now() - REFRESH_AFTER_MS;

  for (const id of ids) {
    const row = cached.get(id);
    // A player-uploaded avatar is never stale. Without this the weekly Steam
    // refresh would quietly overwrite a custom avatar with the Steam one.
    if (row?.AvatarUrl && (isCustomAvatar(row.AvatarUrl) || row.UpdatedAt.getTime() > cutoff)) {
      out[id] = row.AvatarUrl;
    } else {
      stale.push(id);
    }
  }

  if (stale.length > 0) {
    const fresh = await fetchFromSteam(stale);
    for (const [id, url] of Array.from(fresh.entries())) {
      out[id] = url;
      try {
        await prisma.gardenWebProfile.upsert({
          where: { SteamId: BigInt(id) },
          update: { AvatarUrl: url },
          create: { SteamId: BigInt(id), AvatarUrl: url },
        });
      } catch {
        // Cache write is best-effort; the resolved URL is still returned.
      }
    }
    // Anything Steam did not return (private or deleted account) keeps whatever
    // stale value we had rather than flapping to the placeholder.
    for (const id of stale) {
      if (!out[id] && cached.get(id)?.AvatarUrl) out[id] = cached.get(id)!.AvatarUrl!;
    }
  }

  for (const id of ids) if (!out[id]) out[id] = DEFAULT_AVATAR;
  return out;
}

/** Single-player convenience wrapper. */
export async function resolveAvatar(steamId: string | bigint): Promise<string> {
  const map = await resolveAvatars([steamId]);
  return map[String(steamId)] ?? DEFAULT_AVATAR;
}
