/**
 * Pickup games: a lobby of friends, run as a tournament match.
 *
 * The matchmaking lobby used to own its whole back half — its own veto, its own
 * hand-off, its own RCON sequence against one hardcoded server. That server is
 * now a tournament server running the tournament plugin, so the hand-off spoke a
 * protocol nothing on the other end understood (`css_cr_reset` answers
 * "Unknown command"), and the lobby sat on "starting" for ever.
 *
 * Rather than teach the lobby the new protocol, a formed lobby now becomes a
 * real match: two teams, a stage, a row in TournamentMatches. Everything after
 * that is machinery that already exists and is already tested — the role draft,
 * the veto, claiming a free server from the pool and queueing when there is
 * none, the scoreboard, the demos, the admin controls. The lobby's job ends at
 * "here are two teams", and the match page takes it from there.
 *
 * It hides in a tournament of its own, one per team size, unpublished so it
 * never appears in the hub next to real events.
 *
 * Import-free and tested, because everything here is decidable from the two
 * rosters alone, and the one rule that matters — a player cannot be on both
 * sides — is the same rule whose absence would put somebody's stats on two
 * teams at once.
 */

/** The sizes the game servers will actually run. */
export const PICKUP_SIZES = [2, 3] as const;

export type PickupSize = (typeof PICKUP_SIZES)[number];

/**
 * The hidden tournament a pickup of this size belongs to.
 *
 * One per size rather than one overall, because TeamSize lives on the
 * tournament and a 2v2 and a 3v3 cannot share it. Stable so the same row is
 * reused for ever rather than a new tournament per game.
 */
export const pickupSlug = (teamSize: number) => `pickup-${teamSize}v${teamSize}`;

export const pickupName = (teamSize: number) => `Pickup ${teamSize}v${teamSize}`;

/** Whether this is a size the fleet can run. */
export const isPickupSize = (n: number): n is PickupSize =>
  (PICKUP_SIZES as readonly number[]).includes(n);

export type PickupTeam = {
  /** SteamID64s, captain first — the first id drives the veto for that side. */
  players: string[];
  /** What to call them. Falls back to the captain's name, then to a side name. */
  name?: string | null;
  /**
   * Which of those ids are bots.
   *
   * Kept as a set of ids rather than a parallel array so the two cannot fall out
   * of step when a caller reorders the roster.
   */
  bots?: string[];
};

/** Whether this id belongs to a bot rather than a person. */
export const isBotId = (id: string) => looksLikeBotId(id);

export type PickupCheck = { ok: true } | { ok: false; error: string };

const looksLikeSteamId = (s: string) => /^7656119\d{10}$/.test(s.trim());

/**
 * A bot's synthetic id, from lib/tournament/bots.ts.
 *
 * 76561999… sits far above anything Valve has issued, so it cannot collide with
 * a person and is recognisable as synthetic at a glance. Accepted here because
 * a lobby filled with bots is the one flow a person can walk alone, and refusing
 * it made solo matchmaking form a match and then abandon it.
 */
const looksLikeBotId = (s: string) => /^76561999\d{9}$/.test(s.trim());

/**
 * Whether two rosters can be made into a match.
 *
 * The duplicate check spans BOTH teams on purpose. A player on both sides is
 * not a 2v2 with a keen participant, it is a match whose stats cannot be
 * attributed and whose scoreboard has the same person on two lines — the same
 * reason the tournament exception controls refuse it outright rather than
 * warning.
 */
export function validatePickup(teamSize: number, a: PickupTeam, b: PickupTeam): PickupCheck {
  if (!isPickupSize(teamSize)) {
    return { ok: false, error: `${teamSize}v${teamSize} is not a size these servers run.` };
  }

  for (const [side, team] of [["A", a], ["B", b]] as const) {
    if (team.players.length !== teamSize) {
      return {
        ok: false,
        error: `Team ${side} has ${team.players.length} players; a ${teamSize}v${teamSize} needs ${teamSize}.`,
      };
    }

    for (const id of team.players) {
      if (!looksLikeSteamId(id) && !looksLikeBotId(id)) {
        return { ok: false, error: `"${id}" is not a SteamID64.` };
      }
    }
  }

  const all = [...a.players, ...b.players].map((s) => s.trim());
  const seen = new Set<string>();

  for (const id of all) {
    if (seen.has(id)) {
      return { ok: false, error: "The same player is on both teams." };
    }
    seen.add(id);
  }

  return { ok: true };
}

/**
 * What to call a side.
 *
 * A pickup has no team identity, and "Team A" twice in a scoreboard is worse
 * than useless when both are strangers. The captain's name is the one thing
 * everybody in the lobby recognises, so it names the team — the shape a pickup
 * game has always had, verbally, before anybody wrote it down.
 */
export function pickupTeamName(team: PickupTeam, captainName: string | null, fallback: string): string {
  const given = (team.name ?? "").trim();
  if (given) return given.slice(0, 64);

  const captain = (captainName ?? "").trim();
  // "'s team" on a 24-character Steam name would truncate mid-word, so the
  // possessive only goes on names short enough to survive it.
  if (captain && captain.length <= 24) return `${captain}'s team`.slice(0, 64);

  return fallback;
}

/**
 * The key the plugin and every stat row join on.
 *
 * Prefixed so a pickup is recognisable in a server log next to a tournament
 * match, and carries the match id because that is what makes it unique — the
 * lobby id is not, since a lobby can play more than one game.
 */
export const pickupMatchKey = (matchId: number) => `pu${matchId}`;
