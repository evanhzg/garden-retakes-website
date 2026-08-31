/**
 * Who is allowed to concede a map, and for which team.
 *
 * Import-free and on its own, because it is decidable from a roster and a
 * viewer id, and because the interesting cases are the ones nobody reaches by
 * hand: a spectator pressing the button, a player who left the team, a team
 * whose only captain is a bot, a match that has already finished.
 *
 * The rule differs from the in-game one on purpose. `.gg` on the server needs
 * the WHOLE team to ask within twenty seconds, because in a live server there
 * is no notion of authority — everyone is present and equal, and the only
 * defence against one angry player throwing the map is to require all of them.
 * The website has a captain, which is exactly that authority written down. So
 * here the captain concedes and the confirmation is a dialog rather than a
 * quorum. Both routes end up in the same place: TournamentMatch.Surrender.
 *
 * Where a team has no captain — an all-bot side, or one whose captain left —
 * any accepted human on it may concede. Better than a team that cannot give up
 * at all, and the only alternative would be to invent a second captain.
 */

export type Slot = "a" | "b";

export type SurrenderMember = {
  steamId: string;
  isCaptain: boolean;
  /** invited | accepted | declined | removed */
  status: string;
  isBot?: boolean;
};

export type SurrenderRequest = {
  /** The viewer, as a decimal SteamID64 string. Null when signed out. */
  steamId: string | null;
  /** State of the match row: pending | veto | ready | live | finished | forfeit. */
  state: string;
  teamA: SurrenderMember[];
  teamB: SurrenderMember[];
  /** Organizers and site admins may always concede on a team's behalf. */
  isAdmin?: boolean;
  /** Which team an admin is conceding for. Ignored for players. */
  adminSlot?: Slot;
};

export type SurrenderDecision =
  | { ok: true; slot: Slot; winner: Slot; asAdmin: boolean }
  | { ok: false; error: string };

/** A member who counts: on the roster, not a bot, and actually accepted. */
const isActiveHuman = (m: SurrenderMember) => m.status === "accepted" && !m.isBot;

/**
 * Whether this member may speak for their team.
 *
 * The captain, or anybody active if the side has no active captain. Asked of
 * one team's roster at a time, so it cannot accidentally let somebody concede
 * for the other one.
 */
export function maySpeakForTeam(steamId: string, team: SurrenderMember[]): boolean {
  const me = team.find((m) => m.steamId === steamId);
  if (!me || !isActiveHuman(me)) return false;

  const captains = team.filter((m) => isActiveHuman(m) && m.isCaptain);
  if (captains.length === 0) return true;

  return me.isCaptain;
}

/**
 * A match can only be conceded while it is being played.
 *
 * "ready" counts: the server is claimed and the teams are on it, and a team
 * that has decided not to play should not have to wait for the knife round
 * first. Anything already decided does not, which is what stops a second press
 * on a stale page re-forfeiting a finished match.
 */
const CONCEDABLE = new Set(["ready", "live"]);

export function decideSurrender(req: SurrenderRequest): SurrenderDecision {
  if (!CONCEDABLE.has(req.state)) {
    return req.state === "finished" || req.state === "forfeit"
      ? { ok: false, error: "That match has already ended." }
      : { ok: false, error: "That match is not being played yet." };
  }

  if (req.isAdmin && req.adminSlot) {
    const slot = req.adminSlot;
    return { ok: true, slot, winner: slot === "a" ? "b" : "a", asAdmin: true };
  }

  if (!req.steamId) return { ok: false, error: "Sign in first." };

  const onA = maySpeakForTeam(req.steamId, req.teamA);
  const onB = maySpeakForTeam(req.steamId, req.teamB);

  // Both is not a real state, but a roster can be edited into it and the
  // failure should be a refusal rather than a coin flip over who loses.
  if (onA && onB) {
    return { ok: false, error: "You are listed on both teams — ask an organizer." };
  }

  if (onA) return { ok: true, slot: "a", winner: "b", asAdmin: false };
  if (onB) return { ok: true, slot: "b", winner: "a", asAdmin: false };

  const onRoster = [...req.teamA, ...req.teamB].some((m) => m.steamId === req.steamId);

  return onRoster
    ? { ok: false, error: "Only your team's captain can concede." }
    : { ok: false, error: "You are not playing in this match." };
}
