/**
 * Who may drive a game server from the website.
 *
 * Import-free, the house rule for the decidable parts of this codebase, and the
 * reason is the same as always: this is the part most worth testing and it
 * needs no database to answer.
 *
 * The bug it exists to fix: /api/admin/rcon gates on `ctx.level >=
 * AdminLevel.Admin`, which reads the GardenAdmins ladder and nothing else. An
 * organizer is not on that ladder — being an organizer is a different job, by
 * design — so their level is 0 and every server command they tried came back
 * 403. In practice only Owners could change a map, which is what was reported.
 *
 * The fix is not to promote organizers onto the admin ladder. That would give
 * whoever runs a Thursday cup permanent authority over the public retakes
 * server, which is a much larger grant than anybody asked for. The scope that
 * matches the intent — "admin powers for the duration of the tournament" — is:
 *
 *   an organizer may drive a server their tournament is currently using.
 *
 * Currently, and only currently. The moment the match ends and the server is
 * released it stops being theirs, which is exactly the lifetime the phrase "for
 * the duration" describes.
 */

/** The GardenAdmins level at and above which somebody drives any server. */
export const SERVER_ADMIN_LEVEL = 2;

export type ServerActor = {
  /** GardenAdmins level: 0 none, 1 moderator, 2 admin, 3 owner. */
  adminLevel: number;
  /** Authorized by ?key= — the superuser path. */
  viaKey?: boolean;
  /** Tournament ids this person is named as an organizer on. */
  organizerOf: readonly number[];
};

/** The server, as far as this decision is concerned. */
export type ServerClaim = {
  id: number;
  /** Whether it is a tournament server at all. */
  isTournament: boolean;
  /**
   * The tournament currently holding it, if any — resolved from the match it
   * is running. Null when the server is idle or on the public ladder.
   */
  heldByTournamentId: number | null;
};

export type AccessReason =
  | "admin"
  | "key"
  | "organizer-of-holding-tournament"
  | "not-an-organizer"
  | "tournament-does-not-hold-it"
  | "not-a-tournament-server";

export type Access = { allowed: boolean; reason: AccessReason };

/**
 * May this actor run a command on this server?
 *
 * Admin and above, and the superuser key, may drive anything — that is what the
 * ladder is for and nothing here narrows it.
 *
 * Everyone else needs two things at once: to be an organizer of the tournament
 * that currently holds the server, and for that to be a tournament server in
 * the first place. The second test is not redundant with the first. A public
 * ladder server has no holding tournament, so the first test already refuses
 * it — but stating it separately means the refusal says which rule was missed,
 * and "that is not a tournament server" is a different conversation from "your
 * tournament is not on it".
 */
export function canDriveServer(actor: ServerActor, server: ServerClaim): Access {
  if (actor.viaKey) return { allowed: true, reason: "key" };
  if (actor.adminLevel >= SERVER_ADMIN_LEVEL) return { allowed: true, reason: "admin" };

  if (!server.isTournament) {
    return { allowed: false, reason: "not-a-tournament-server" };
  }

  if (actor.organizerOf.length === 0) {
    return { allowed: false, reason: "not-an-organizer" };
  }

  if (server.heldByTournamentId === null || !actor.organizerOf.includes(server.heldByTournamentId)) {
    return { allowed: false, reason: "tournament-does-not-hold-it" };
  }

  return { allowed: true, reason: "organizer-of-holding-tournament" };
}

/** What to tell somebody who was refused. */
export function refusalMessage(reason: AccessReason): string {
  switch (reason) {
    case "not-a-tournament-server":
      return "That is not a tournament server — only site admins can drive it.";
    case "not-an-organizer":
      return "Only site admins and tournament organizers can run commands.";
    case "tournament-does-not-hold-it":
      return "Your tournament is not on that server right now.";
    default:
      return "Not authorized.";
  }
}

/**
 * Commands an organizer may not run, however much authority they have over the
 * match.
 *
 * Deliberately tiny, and deliberately not a general safety net. An organizer is
 * meant to have the admin powers — changing the map, restarting, forcing a
 * side, kicking somebody — and a console that second-guesses those would be a
 * console nobody could use to fix anything.
 *
 * What is blocked is the handful that outlive the tournament: changing the
 * server's credentials locks the actual owner out permanently, and quitting the
 * process needs somebody with hosting access to undo. Neither is a thing a
 * match ever needs, and both are unrecoverable from the website.
 *
 * Site admins are not subject to this. They own the box.
 */
const RESERVED = [
  "rcon_password",
  "sv_password",
  "sv_rcon_",
  "quit",
  "exit",
  "_restart",
  "sv_downloadurl",
  "sv_cheats",
];

/** Whether an organizer-level actor may run this command. */
export function isReservedCommand(command: string): boolean {
  const first = command.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return RESERVED.some((r) => first === r || first.startsWith(r));
}
