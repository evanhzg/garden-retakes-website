/**
 * Who may create a tournament, and who may manage a given one.
 *
 * Deliberately import-free — the same house rule `lib/adminImmunity.ts` and
 * `lib/gameModes.ts` follow. This is the part of the organizer system that is
 * pure arithmetic over three facts, it is the part most worth testing, and
 * keeping it here means the tests need no database and no session.
 *
 * The three facts:
 *
 *   adminLevel  — the GardenAdmins ladder. Admin and above manage everything.
 *   isOrganizer — in the GardenOrganizers registry. May create their own.
 *   organizes   — is named on THIS tournament's organizer list.
 *
 * Note what is deliberately absent: being a Moderator grants nothing here.
 * Moderation and event management are different jobs, and a moderator who
 * should also run events is added to the organizer registry like anybody else.
 */

export type TournamentActor = {
  /** GardenAdmins level: 0 none, 1 moderator, 2 admin, 3 owner. */
  adminLevel: number;
  /** SteamID64, or null when authorized purely by the superuser key. */
  steamId: string | null;
  /** In the GardenOrganizers registry. */
  isOrganizer: boolean;
  /** Authorized by ?key= — the superuser path, which is Owner everywhere. */
  viaKey?: boolean;
  /**
   * This actor's role in the org that runs the tournament in question, if any.
   *
   * "organizer" runs the event and can do everything a named tournament
   * organizer can. "moderator" WORKS the event: tickets, admin calls, fixing a
   * score, restarting a match, messaging players — and cannot change what the
   * tournament is.
   *
   * That split is the point of having roles at all: the person you want awake
   * at 2am to restart a server is not necessarily the person you want able to
   * delete the bracket.
   */
  orgRole?: OrgRole | null;
};

export type OrgRole = "organizer" | "moderator";

/** The level at and above which an admin manages every tournament. */
export const MANAGE_ALL_LEVEL = 2;

/** Admin, Owner, or the superuser key: manages any tournament that exists. */
export function managesEverything(actor: TournamentActor): boolean {
  return Boolean(actor.viaKey) || actor.adminLevel >= MANAGE_ALL_LEVEL;
}

/** May start a new tournament of their own. */
export function canCreateTournament(actor: TournamentActor): boolean {
  return managesEverything(actor) || actor.isOrganizer;
}

/**
 * May edit this tournament — its stages, pool, bracket, matches and servers.
 *
 * `organizerSteamIds` is the tournament's own organizer list. The creator is on
 * it (the migration backfills them), so ownership needs no separate test.
 */
export function canManageTournament(
  actor: TournamentActor,
  organizerSteamIds: readonly string[],
): boolean {
  if (managesEverything(actor)) return true;
  if (!actor.steamId) return false;
  return organizerSteamIds.includes(actor.steamId);
}

/**
 * May add or remove organizers on this tournament.
 *
 * Same answer as managing it. An organizer bringing in a co-organizer is the
 * normal way a second person gets access, and requiring an admin for it would
 * make every co-host a support request.
 */
/**
 * Whether this actor may INTERVENE in a running tournament without being able
 * to change what it is.
 *
 * Deliberately wider than canManageTournament: everybody who can manage can
 * also moderate, plus the org's moderators. The two are asked separately
 * because they protect different things — one guards the bracket, the other
 * guards the match — and collapsing them into a single boolean is how a
 * moderator ends up able to delete a stage.
 */
export function canModerateTournament(
  actor: TournamentActor,
  organizerSteamIds: readonly string[],
): boolean {
  if (canManageTournament(actor, organizerSteamIds)) return true;
  return actor.orgRole === "moderator";
}

export function canEditOrganizers(
  actor: TournamentActor,
  organizerSteamIds: readonly string[],
): boolean {
  return canManageTournament(actor, organizerSteamIds);
}

/**
 * May add and remove people from the global organizer registry.
 *
 * Admin and above only. Letting organizers appoint organizers would make the
 * registry self-expanding, which is a permission system with no edge.
 */
export function canEditOrganizerRegistry(actor: TournamentActor): boolean {
  return managesEverything(actor);
}

/**
 * Whether removing this organizer would leave the tournament with none.
 *
 * A tournament nobody can manage is only recoverable by an admin, so the last
 * one is refused rather than being a mistake somebody has to notice.
 */
export function isLastOrganizer(
  organizerSteamIds: readonly string[],
  removing: string,
): boolean {
  return organizerSteamIds.length <= 1 && organizerSteamIds.includes(removing);
}

/** What to call the actor's standing, for a badge. */
export function tournamentRoleName(actor: TournamentActor): "Owner" | "Admin" | "Organizer" | "None" {
  if (actor.viaKey || actor.adminLevel >= 3) return "Owner";
  if (actor.adminLevel >= MANAGE_ALL_LEVEL) return "Admin";
  if (actor.isOrganizer) return "Organizer";
  return "None";
}
