/**
 * Who may drive a game server.
 *
 * The bug: /api/admin/rcon gates on `ctx.level >= AdminLevel.Admin`, which
 * reads the GardenAdmins ladder and nothing else. An organizer is deliberately
 * not on that ladder — running events and moderating the site are different
 * jobs — so their level is 0 and every server command came back 403. Reported
 * as "only Owners can change the map", which is what it looked like from
 * outside.
 *
 * The fix had to be narrow. Promoting organizers onto the admin ladder would
 * hand whoever runs a Thursday cup permanent authority over the public retakes
 * server, which is a far larger grant than the problem. So the rule is scoped
 * to the servers their tournament is HOLDING, and these cases are mostly about
 * where that scope ends.
 */
import {
  canDriveServer,
  isReservedCommand,
  refusalMessage,
  type ServerActor,
  type ServerClaim,
} from "@/lib/tournament/serverAccess";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const nobody: ServerActor = { adminLevel: 0, organizerOf: [] };
const organizer = (...ids: number[]): ServerActor => ({ adminLevel: 0, organizerOf: ids });
const moderator: ServerActor = { adminLevel: 1, organizerOf: [] };
const admin: ServerActor = { adminLevel: 2, organizerOf: [] };
const owner: ServerActor = { adminLevel: 3, organizerOf: [] };
const key: ServerActor = { adminLevel: 0, viaKey: true, organizerOf: [] };

const tourneyServer = (heldBy: number | null): ServerClaim => ({
  id: 4,
  isTournament: true,
  heldByTournamentId: heldBy,
});
const publicServer: ServerClaim = { id: 1, isTournament: false, heldByTournamentId: null };

// ------------------------------------------------------------- the ladder

check("an owner drives anything", canDriveServer(owner, publicServer).allowed);
check("an admin drives anything", canDriveServer(admin, tourneyServer(null)).allowed);
check("the superuser key drives anything", canDriveServer(key, publicServer).allowed);

// A moderator is level 1 and deliberately below the bar — moderating chat is
// not the same as restarting a match server.
check("a moderator does not", !canDriveServer(moderator, tourneyServer(7)).allowed);
check("and neither does a stranger", !canDriveServer(nobody, tourneyServer(7)).allowed);

// --------------------------------------------------------- the actual fix

// This is the case that was broken: an organizer, on the server their own
// tournament is playing on, previously got a 403.
check(
  "an organizer drives the server their tournament holds",
  canDriveServer(organizer(7), tourneyServer(7)).allowed,
);
check(
  "and the reason says why they were allowed",
  canDriveServer(organizer(7), tourneyServer(7)).reason === "organizer-of-holding-tournament",
);

// ------------------------------------------------------------ where it ends

// "For the duration of the tournament" is the whole scope. An idle server is
// nobody's, even between two of their own matches.
check(
  "not an idle tournament server",
  !canDriveServer(organizer(7), tourneyServer(null)).allowed,
);
check(
  "not a server another tournament is on",
  !canDriveServer(organizer(7), tourneyServer(9)).allowed,
);
check(
  "and never the public ladder server",
  !canDriveServer(organizer(7), publicServer).allowed,
);

// The refusal has to say which rule was missed: "that is not a tournament
// server" is a different conversation from "your tournament is not on it".
check(
  "a public server refuses for being public",
  canDriveServer(organizer(7), publicServer).reason === "not-a-tournament-server",
);
check(
  "somebody else's match refuses for that",
  canDriveServer(organizer(7), tourneyServer(9)).reason === "tournament-does-not-hold-it",
);
check(
  "a non-organizer is told so",
  canDriveServer(nobody, tourneyServer(7)).reason === "not-an-organizer",
);
check("every refusal has a sentence", refusalMessage("tournament-does-not-hold-it").length > 10);

// Organizing several events at once is normal.
check(
  "an organizer of two tournaments is allowed on either",
  canDriveServer(organizer(3, 7), tourneyServer(3)).allowed &&
    canDriveServer(organizer(3, 7), tourneyServer(7)).allowed,
);

// ------------------------------------------------------ reserved commands

// Deliberately tiny. An organizer is MEANT to have the admin powers — a console
// that second-guesses those is a console nobody can fix anything with.
for (const allowed of [
  "changelevel de_dust2",
  "mp_restartgame 1",
  "css_forceready",
  "kick Rezan",
  "bot_quota 6",
  "status",
  "mp_pause_match",
]) {
  check(`an organizer may run "${allowed}"`, !isReservedCommand(allowed));
}

// What is blocked is what outlives the tournament: credentials lock the real
// owner out permanently, and quitting needs hosting access to undo.
for (const blocked of [
  "rcon_password hunter2",
  "sv_password letmein",
  "quit",
  "exit",
  "_restart",
  "sv_cheats 1",
]) {
  check(`an organizer may not run "${blocked}"`, isReservedCommand(blocked));
}

check("matching is on the verb, not the arguments", !isReservedCommand("say quit is a funny word"));
check("and is case-insensitive", isReservedCommand("RCON_PASSWORD x"));
check("leading whitespace does not slip past", isReservedCommand("   quit"));

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
