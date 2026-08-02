/**
 * FACEIT lookup, keyed on SteamID64.
 *
 * No OAuth and no "connect your account" step: the Data API resolves a player
 * from the Steam id we already authenticate with
 * (`/players?game=cs2&game_player_id=<steamid64>`), so a player who signed in
 * with Steam is already linked. That also means nothing new has to be stored —
 * which matters here, because the database schema is shared with the game
 * plugin and adding a column is a migration on a live server.
 *
 * FACEIT_API_KEY is server-side only; it must never reach the browser.
 */

const BASE = "https://open.faceit.com/data/v4";

/** Data API rate limits are per-key, and a profile page can be reloaded a lot. */
const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; value: FaceitProfile | null }>();

export type FaceitProfile = {
  playerId: string;
  nickname: string;
  country: string | null;
  avatar: string | null;
  url: string;
  level: number | null;
  elo: number | null;
  region: string | null;
  stats: FaceitStats | null;
};

export type FaceitStats = {
  matches: number | null;
  wins: number | null;
  winRate: number | null;
  kd: number | null;
  adr: number | null;
  hs: number | null;
  krRatio: number | null;
  entryRate: number | null;
  entrySuccess: number | null;
  clutch1v1: number | null;
  clutch1v2: number | null;
  utilityDamagePerRound: number | null;
  flashesPerRound: number | null;
  longestWinStreak: number | null;
  currentWinStreak: number | null;
  /** Newest first, true = win. */
  recentResults: boolean[];
};

export const faceitConfigured = () => Boolean(process.env.FACEIT_API_KEY);

async function api(path: string): Promise<unknown | null> {
  const key = process.env.FACEIT_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    // 404 is the ordinary "this Steam account has no FACEIT profile" answer,
    // not a failure worth logging.
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** FACEIT returns every lifetime stat as a string; most are numbers. */
const num = (v: unknown): number | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function readStats(lifetime: Record<string, unknown>): FaceitStats {
  return {
    matches: num(lifetime["Matches"]),
    wins: num(lifetime["Wins"]),
    winRate: num(lifetime["Win Rate %"]),
    kd: num(lifetime["Average K/D Ratio"]),
    adr: num(lifetime["ADR"]),
    hs: num(lifetime["Average Headshots %"]),
    krRatio: num(lifetime["Average K/R Ratio"]),
    // The rate fields come back as 0..1 fractions; the UI renders percentages.
    entryRate: num(lifetime["Entry Rate"]),
    entrySuccess: num(lifetime["Entry Success Rate"]),
    clutch1v1: num(lifetime["1v1 Win Rate"]),
    clutch1v2: num(lifetime["1v2 Win Rate"]),
    utilityDamagePerRound: num(lifetime["Utility Damage per Round"]),
    flashesPerRound: num(lifetime["Flashes per Round"]),
    longestWinStreak: num(lifetime["Longest Win Streak"]),
    currentWinStreak: num(lifetime["Current Win Streak"]),
    recentResults: Array.isArray(lifetime["Recent Results"])
      ? (lifetime["Recent Results"] as unknown[]).map((r) => r === "1" || r === 1)
      : [],
  };
}

/**
 * Resolve a Steam id to a FACEIT profile with lifetime CS2 stats.
 * Returns null when the account has no FACEIT profile, or the key is unset.
 */
export async function faceitForSteamId(steamId: string): Promise<FaceitProfile | null> {
  if (!/^\d{17}$/.test(steamId)) return null;

  const hit = cache.get(steamId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const player = (await api(`/players?game=cs2&game_player_id=${steamId}`)) as
    | {
        player_id?: string;
        nickname?: string;
        country?: string;
        avatar?: string;
        faceit_url?: string;
        games?: { cs2?: { skill_level?: number; faceit_elo?: number; region?: string } };
      }
    | null;

  if (!player?.player_id || !player.nickname) {
    cache.set(steamId, { at: Date.now(), value: null });
    return null;
  }

  const cs2 = player.games?.cs2;
  const raw = (await api(`/players/${player.player_id}/stats/cs2`)) as
    | { lifetime?: Record<string, unknown> }
    | null;

  const value: FaceitProfile = {
    playerId: player.player_id,
    nickname: player.nickname,
    country: player.country ?? null,
    avatar: player.avatar || null,
    // faceit_url carries a {lang} placeholder.
    url: (player.faceit_url ?? `https://www.faceit.com/{lang}/players/${player.nickname}`).replace("{lang}", "en"),
    level: cs2?.skill_level ?? null,
    elo: cs2?.faceit_elo ?? null,
    region: cs2?.region ?? null,
    stats: raw?.lifetime ? readStats(raw.lifetime) : null,
  };

  cache.set(steamId, { at: Date.now(), value });
  return value;
}
