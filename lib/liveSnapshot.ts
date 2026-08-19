import { rconExec } from "@/lib/rcon";

/**
 * What the game server is doing, cached.
 *
 * Every page that shows server state used to run its own RCON command:
 * `/api/server/live` fires on every homepage view and `/api/admin/overview`
 * fires another, so a busy moment meant a burst of connections to a game
 * server that has better things to do — and it will get worse the moment
 * anything polls, which a mobile app or a live widget certainly will.
 *
 * One call, one cache, one shape. A few seconds of staleness is invisible for
 * "how many players are on", and it turns N readers into one command.
 */

export type ServerSnapshot = {
  online: boolean;
  map: string | null;
  mode: string | null;
  players: number;
  ranked: boolean;
  competitive: boolean;
  /** When this was actually read from the server. */
  at: number;
};

const OFFLINE: ServerSnapshot = {
  online: false, map: null, mode: null, players: 0,
  ranked: false, competitive: false, at: 0,
};

/** Long enough to collapse a burst, short enough that nobody notices. */
const TTL_MS = 5_000;

let cached: ServerSnapshot | null = null;
/** The read in flight, so simultaneous callers share it rather than racing. */
let inFlight: Promise<ServerSnapshot> | null = null;

/**
 * Pull the JSON object out of the plugin's `css_gstatus` reply.
 *
 * The previous expression was `/\{[^}]*\}/` — a character class that cannot
 * contain a `}`, so it matches only a flat object and breaks the first time
 * the plugin nests one. Brace-matching from the first `{` handles both, and
 * ignores braces inside strings so a map name with one in it cannot derail it.
 */
export function extractJson(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const c = raw[i];

    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return raw.slice(start, i + 1);
  }

  return null;
}

async function read(): Promise<ServerSnapshot> {
  try {
    const json = extractJson(await rconExec("css_gstatus"));
    if (!json) return { ...OFFLINE, at: Date.now() };

    const p = JSON.parse(json) as {
      map?: string; mode?: string; players?: number;
      ranked?: boolean; competitive?: boolean;
    };

    return {
      online: true,
      map: p.map ?? null,
      mode: p.mode ?? null,
      players: p.players ?? 0,
      ranked: Boolean(p.ranked),
      competitive: Boolean(p.competitive),
      at: Date.now(),
    };
  } catch {
    // Unreachable, unconfigured or mid-restart. Offline is the honest answer
    // and it is cached too, so a down server is not hammered either.
    return { ...OFFLINE, at: Date.now() };
  }
}

export async function serverSnapshot(): Promise<ServerSnapshot> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  if (inFlight) return inFlight;

  inFlight = read()
    .then((snapshot) => {
      cached = snapshot;
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** For tests, and for an admin who wants to force a re-read. */
export function invalidateServerSnapshot(): void {
  cached = null;
}
