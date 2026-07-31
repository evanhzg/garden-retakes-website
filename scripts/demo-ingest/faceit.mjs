/**
 * FACEIT Data API v4 client.
 *
 * Needs FACEIT_API_KEY — a *server-side* key from developers.faceit.com.
 * The client-side key will 401 against this API.
 *
 * Rate limits are not published per-endpoint; the shared client below keeps one
 * request in flight at a time with a small floor delay, which has been enough.
 */

const BASE = "https://open.faceit.com/data/v4";

let lastCall = 0;
const MIN_GAP_MS = 120;

async function api(path, key) {
  const gap = Date.now() - lastCall;
  if (gap < MIN_GAP_MS) await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
  lastCall = Date.now();

  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`FACEIT ${res.status} ${res.statusText} on ${path}`);
  }
  return res.json();
}

export async function playerByNickname(nickname, key, game = "cs2") {
  return api(`/players?nickname=${encodeURIComponent(nickname)}&game=${game}`, key);
}

export async function playerById(playerId, key) {
  return api(`/players/${playerId}`, key);
}

/** Most recent matches, newest first. FACEIT caps `limit` at 100. */
export async function matchHistory(playerId, key, { game = "cs2", limit = 20, offset = 0 } = {}) {
  const j = await api(
    `/players/${playerId}/history?game=${game}&offset=${offset}&limit=${Math.min(limit, 100)}`,
    key,
  );
  return j?.items ?? [];
}

export async function matchDetails(matchId, key) {
  return api(`/matches/${matchId}`, key);
}

/**
 * Skill band for a match, derived from the average FACEIT elo of its players.
 *
 * Bands rather than raw elo because the benchmark needs enough samples per
 * bucket to be a distribution rather than a handful of points.
 */
export function bandOf(elo) {
  if (elo == null) return "unknown";
  if (elo < 800) return "1-2";
  if (elo < 1100) return "3-4";
  if (elo < 1350) return "5-6";
  if (elo < 1700) return "7-8";
  if (elo < 2000) return "9";
  return "10";
}

export const BANDS = ["1-2", "3-4", "5-6", "7-8", "9", "10", "pro"];

/**
 * Resolves the demo URLs for a match. FACEIT returns them on the match object
 * once the demo has been processed; recent matches often have none yet.
 */
export function demoUrls(match) {
  const urls = match?.demo_url;
  if (Array.isArray(urls)) return urls.filter(Boolean);
  return urls ? [urls] : [];
}

/** Average faceit elo across both rosters, for banding. */
export async function matchAverageElo(match, key) {
  const ids = [];
  for (const faction of Object.values(match?.teams ?? {})) {
    for (const p of faction?.roster ?? []) if (p?.player_id) ids.push(p.player_id);
  }
  if (ids.length === 0) return null;

  const elos = [];
  for (const id of ids) {
    try {
      const p = await playerById(id, key);
      const e = p?.games?.cs2?.faceit_elo;
      if (typeof e === "number") elos.push(e);
    } catch {
      // One unreachable player should not sink the whole match.
    }
  }
  return elos.length ? Math.round(elos.reduce((s, e) => s + e, 0) / elos.length) : null;
}
