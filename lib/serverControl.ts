/**
 * The decidable parts of driving a game server from the website.
 *
 * Import-free, the house rule this codebase follows for anything with one
 * correct answer given some strings. Everything here reads or writes text: what
 * a `status` reply says, whether a typed search matches a player, what has to
 * happen for a server running one plugin to run a mode belonging to another.
 * None of it needs a socket or a database, which is what makes it testable —
 * and the parsing in particular is worth testing, because a `status` parser
 * that quietly matches nothing looks exactly like a server with nobody on it.
 */

// ---------------------------------------------------------------- steam ids

/** The first SteamID64. Account ids are offsets from here. */
const ACCOUNT_BASE = BigInt("76561197960265728");

/**
 * A SteamID64 from whichever of the three forms the server printed.
 *
 * `status` does not print one form. Which you get depends on the build and on
 * whether the line came from the engine or from a plugin: CS2 prints `[U:1:n]`,
 * older output prints `STEAM_1:y:z`, and anything that came back through a
 * plugin is usually already a 64-bit id. Accepting all three is cheaper than
 * discovering on the night that this build prints the other one.
 */
export function steamId64(raw: string): string | null {
  const text = raw.trim();

  const already = /^7656119\d{10}$/.exec(text);
  if (already) return text;

  const modern = /^\[?U:1:(\d{1,10})\]?$/i.exec(text);
  if (modern) return (ACCOUNT_BASE + BigInt(modern[1])).toString();

  const legacy = /^STEAM_[0-5]:([01]):(\d{1,10})$/i.exec(text);
  if (legacy) {
    return (ACCOUNT_BASE + BigInt(legacy[2]) * BigInt(2) + BigInt(legacy[1])).toString();
  }

  return null;
}

// ------------------------------------------------------------------- status

export type StatusPlayer = {
  /**
   * The engine's slot number, when the line carried one.
   *
   * Preferred over the SteamID for `kickid` only because it is what the engine
   * itself indexes by; either works, and the SteamID is the fallback precisely
   * because a userid column that moved is the likeliest part of this to break.
   */
  userid: string | null;
  name: string;
  /** SteamID64, when the line carried an id in any recognisable form. */
  steamId: string | null;
  /** Verbatim, so `kickid` can be handed exactly what the server printed. */
  rawId: string | null;
};

/**
 * The players in a `status` reply.
 *
 * Line-oriented and deliberately loose. `status` has had at least three column
 * layouts across CS2 builds and matchRunner already documents that it does not
 * depend on the exact format; a parser pinned to one of them is a parser that
 * reports an empty server after a Tuesday update. So a line counts as a player
 * only if it carries something that resolves to a SteamID, and everything else
 * on it — the name, the slot — is read out best-effort around that anchor.
 *
 * The header row is excluded by the same rule rather than by matching its text:
 * it has no id on it.
 */
export function parseStatus(raw: string): StatusPlayer[] {
  const out: StatusPlayer[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const idToken = /(\[?U:1:\d{1,10}\]?|STEAM_[0-5]:[01]:\d{1,10}|\b7656119\d{10}\b)/i.exec(line);
    if (!idToken) continue;

    const id = steamId64(idToken[1]);
    if (!id) continue;

    // Either quote style, because the engine and the plugins disagree about it.
    const quoted = /"([^"]{1,64})"|'([^']{1,64})'/.exec(line);
    const name = (quoted?.[1] ?? quoted?.[2] ?? "").trim();

    // The slot, when the line starts with one. `1:23` is a userid followed by
    // connection time in the older layout, so the colon is not part of it.
    const slot = /^\s*(\d{1,4})[\s:]/.exec(line);

    out.push({
      userid: slot ? slot[1] : null,
      name: name || id,
      steamId: id,
      rawId: idToken[1],
    });
  }

  return out;
}

/** The map named in a `status` reply, for the "reload this map" button. */
export function parseStatusMap(raw: string): string | null {
  const line = /^\s*map\s*:\s*(\S+)/im.exec(raw);
  if (!line) return null;

  // CS2 prints `de_mirage` on some builds and `de_mirage at: 0 x, 0 y, 0 z` on
  // others. Only the first token is the map.
  return line[1].split(/\s+/)[0] || null;
}

// ------------------------------------------------------------ player search

/** Everything a regex could take as an operator, so a literal stays literal. */
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type SearchablePlayer = { name: string; steamId: string };

/**
 * A matcher built from whatever the admin has typed so far.
 *
 * Regex, because `^s1mple$` and `niko|device` are both things people type into
 * a player search and both are useful when the roster is long. But a pattern
 * somebody is halfway through typing is usually not a valid one — `new
 * RegExp("(")` throws, and so does every keystroke of `(niko|dev` until the
 * closing bracket lands. A search box that throws on most of the way to a
 * working pattern is worse than one that never accepted a regex at all, so an
 * uncompilable pattern is matched as a literal substring instead. The user sees
 * the list narrow the whole way through rather than empty out and come back.
 *
 * Permissive in the other directions too: case-insensitive, unanchored, and
 * tried against the SteamID as well as the name, since pasting an id into a
 * name box is the other thing admins do. Whitespace-separated terms all have to
 * match, so "evan admin" narrows rather than widening — but only in the literal
 * fallback, because in a real regex a space is a space the user asked for.
 */
export function playerMatcher(query: string): (p: SearchablePlayer) => boolean {
  const text = query.trim();
  if (!text) return () => true;

  let pattern: RegExp | null = null;
  try {
    pattern = new RegExp(text, "i");
  } catch {
    pattern = null;
  }

  if (pattern) {
    const compiled = pattern;
    return (p) => compiled.test(p.name) || compiled.test(p.steamId);
  }

  const terms = text.split(/\s+/).map((t) => new RegExp(escapeRegex(t), "i"));
  return (p) => terms.every((t) => t.test(p.name) || t.test(p.steamId));
}

// ------------------------------------------------------------------- safety

/**
 * Whether a value can go on an RCON command line unquoted.
 *
 * The Source console separates commands with `;`, so anything interpolated into
 * a command runs as a second command if it contains one — the hole
 * `safePlayerArg` in lib/adminActions.ts exists to close. This is the same rule
 * stated as an allowlist, which is the stricter direction: a map name, a cfg
 * name and a SteamID are all drawn from this alphabet, and nothing that is not
 * has any business being sent.
 */
export const isSafeArg = (value: string): boolean =>
  /^[A-Za-z0-9_./:[\]-]{1,64}$/.test(value.trim());

// ------------------------------------------------------------------ plugins

/**
 * Which of the two plugins a server is running.
 *
 * They are separate builds, not two modes of one thing: the public ladder box
 * runs the all-in-one `R5e-games` and answers `css_gamemode`, the tournament
 * fleet runs `R5eGames.Tournament` and answers `css_t_*`. Sending either one's
 * commands to the other gets "Unknown command", which is how a Maker session
 * once wrote its rows against a server that had never heard of the command —
 * the request succeeded and nothing happened in the game.
 */
export type PluginKind = "ladder" | "tournament" | "both" | "unknown";

/** What the plugins are called on disk, overridable per deployment. */
export const LADDER_PLUGIN = process.env.GARDEN_LADDER_PLUGIN || "R5e-games";
export const TOURNAMENT_PLUGIN = process.env.GARDEN_TOURNAMENT_PLUGIN || "R5eGames.Tournament";

/**
 * Reads `css_plugins list` output.
 *
 * Substring rather than a parse of CounterStrikeSharp's numbered listing: the
 * listing format has changed between CSSharp versions and the only fact wanted
 * here is which of two names appears. "both" is a real answer and not an error
 * — a box with both DLLs deployed can have both loaded, which is worth showing
 * rather than picking one and being wrong half the time.
 */
export function detectPlugin(pluginsList: string): PluginKind {
  const text = pluginsList.toLowerCase();
  const ladder = text.includes(LADDER_PLUGIN.toLowerCase());
  const tournament = text.includes(TOURNAMENT_PLUGIN.toLowerCase());

  if (ladder && tournament) return "both";
  if (tournament) return "tournament";
  if (ladder) return "ladder";
  return "unknown";
}

/** Which plugin a mode belongs to. */
export type ModeFamily = "ladder" | "tournament";

export type ModePlan =
  /** The plugin that owns this mode is already loaded; one command does it. */
  | { kind: "ready"; commands: string[] }
  /** The other plugin owns it. Unloading one and loading the other is a restart. */
  | { kind: "swap"; unload: string; load: string; commands: string[] }
  /** Nothing answered `css_plugins list`, so this would be a guess. */
  | { kind: "unknown" };

/**
 * What has to happen for a server to run a mode.
 *
 * The interesting case is the third one. Changing between two ladder modes is a
 * cvar-sized change the plugin makes in place; changing between a ladder mode
 * and Blitz is a different plugin, and there is no honest way to present that
 * as the same button. So the plan says which it is and the UI says so too —
 * "this unloads one plugin, loads the other and restarts the server" is a
 * sentence somebody can decide about, and "Switch mode" silently taking the
 * server down for a minute is not.
 *
 * `unknown` is kept rather than defaulting to "ready": guessing wrong sends
 * `css_gamemode` to a tournament server, which answers "Unknown command" and
 * looks from the website exactly like a mode change that worked.
 */
export function modePlan(current: PluginKind, wanted: ModeFamily, modeId: string): ModePlan {
  const command = wanted === "ladder" ? `css_gamemode ${modeId}` : "css_t_status";

  if (current === "unknown") return { kind: "unknown" };
  if (current === "both" || current === wanted) return { kind: "ready", commands: [command] };

  const load = wanted === "ladder" ? LADDER_PLUGIN : TOURNAMENT_PLUGIN;
  const unload = wanted === "ladder" ? TOURNAMENT_PLUGIN : LADDER_PLUGIN;

  return {
    kind: "swap",
    unload,
    load,
    // The restart is last and is the point: CounterStrikeSharp can unload a
    // plugin, but the two of these hook the same game events and hold the same
    // cvars, and a hot swap leaves whichever one lost the race half-attached.
    // A restart is the only state either plugin is known to come up clean in.
    commands: [`css_plugins unload ${unload}`, `css_plugins load ${load}`, "_restart"],
  };
}
