/**
 * The organizer gate.
 *
 * Two failures this exists to catch, both of which look like nothing in a
 * screenshot:
 *
 *   1. An organizer managing somebody else's tournament. The list of organizers
 *      is fetched per tournament, and an empty list is indistinguishable from
 *      "you are not on it" — so a caller that forgets to load it grants access
 *      to everybody rather than nobody.
 *   2. The last organizer being removed, leaving an event only an admin can
 *      recover.
 */
import {
  canCreateTournament,
  canManageTournament,
  canModerateTournament,
  canEditOrganizerRegistry,
  isLastOrganizer,
  managesEverything,
  tournamentRoleName,
} from "@/lib/tournamentRoles";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const nobody = { adminLevel: 0, steamId: "1", isOrganizer: false };
const moderator = { adminLevel: 1, steamId: "2", isOrganizer: false };
const organizer = { adminLevel: 0, steamId: "3", isOrganizer: true };
const modOrganizer = { adminLevel: 1, steamId: "4", isOrganizer: true };
const admin = { adminLevel: 2, steamId: "5", isOrganizer: false };
const owner = { adminLevel: 3, steamId: "6", isOrganizer: false };
const webKey = { adminLevel: 3, steamId: null, isOrganizer: false, viaKey: true };

// ---- Creating ----
check("a nobody cannot create", !canCreateTournament(nobody));
check("a moderator cannot create", !canCreateTournament(moderator));
check("an organizer can create", canCreateTournament(organizer));
check("an admin can create", canCreateTournament(admin));
check("an owner can create", canCreateTournament(owner));
check("the web key can create", canCreateTournament(webKey));

// ---- Managing one tournament ----
// "3" runs this one. "9" runs a different one.
const theirs = ["3"];
const someoneElses = ["9"];

check("an organizer manages their own", canManageTournament(organizer, theirs));
check("an organizer does NOT manage another's", !canManageTournament(organizer, someoneElses));
check("a co-organizer manages it too", canManageTournament(organizer, ["9", "3"]));
check("an admin manages another's", canManageTournament(admin, someoneElses));
check("an owner manages another's", canManageTournament(owner, someoneElses));
check("the web key manages another's", canManageTournament(webKey, someoneElses));
check("a moderator manages nothing", !canManageTournament(moderator, someoneElses));

// The failure mode the API shape is designed around: an empty organizer list
// must lock everybody out, not let everybody in.
check("an empty organizer list admits no organizer", !canManageTournament(organizer, []));
check("an empty organizer list still admits an admin", canManageTournament(admin, []));

// A key-authorized caller has no SteamID at all, so it must never be matched
// against the list by identity — only by standing.
check(
  "a signed-out caller is not admitted by a list containing null-ish ids",
  !canManageTournament({ adminLevel: 0, steamId: null, isOrganizer: true }, ["3"]),
);

// ---- The registry ----
check("an organizer cannot appoint organizers", !canEditOrganizerRegistry(organizer));
check("a mod-organizer cannot appoint organizers", !canEditOrganizerRegistry(modOrganizer));
check("an admin can appoint organizers", canEditOrganizerRegistry(admin));
check("the web key can appoint organizers", canEditOrganizerRegistry(webKey));

// ---- The last organizer ----
check("removing the only organizer is refused", isLastOrganizer(["3"], "3"));
check("removing one of two is allowed", !isLastOrganizer(["3", "9"], "3"));
check("removing somebody not on the list is not 'last'", !isLastOrganizer(["3"], "9"));

// ---- Badges ----
check("owner reads Owner", tournamentRoleName(owner) === "Owner");
check("admin reads Admin", tournamentRoleName(admin) === "Admin");
check("organizer reads Organizer", tournamentRoleName(organizer) === "Organizer");
check("moderator reads None", tournamentRoleName(moderator) === "None");
check("web key reads Owner", tournamentRoleName(webKey) === "Owner");
// Standing beats the registry: an admin who is also an organizer is an admin.
check("an admin-organizer reads Admin", tournamentRoleName({ ...admin, isOrganizer: true }) === "Admin");

check("managesEverything is admin-and-up only", managesEverything(admin) && !managesEverything(modOrganizer));

// ------------------------------------------------------- org moderators ----
//
// The split that makes an org worth having: the person you want awake at 2am to
// restart a server is not necessarily the person you want able to delete the
// bracket. These two must never collapse into one boolean.

const orgModerator = { adminLevel: 0, steamId: "7", isOrganizer: false, orgRole: "moderator" as const };
const orgOrganizer = { adminLevel: 0, steamId: "8", isOrganizer: false, orgRole: "organizer" as const };

check("an org moderator may moderate", canModerateTournament(orgModerator, someoneElses));
check("an org moderator may NOT manage", !canManageTournament(orgModerator, someoneElses));

// The one that would be silently wrong: an org role must not smuggle structure
// access in through the tournament's own organizer list being empty.
check("an org moderator may not manage an unowned tournament", !canManageTournament(orgModerator, []));

check(
  "an org organizer is not granted structure by the role alone",
  // Being "organizer" IN AN ORG is not the same as being named on the
  // tournament — the grant happens when the tournament is created, by writing
  // them onto it. Anything else means one org's role leaking onto another org's
  // event.
  !canManageTournament(orgOrganizer, someoneElses),
);

check("moderating implies nothing about creating", !canCreateTournament(orgModerator));

// Everyone who can manage can also moderate — otherwise an organizer would be
// locked out of the tools their own moderators have.
check("a tournament organizer may moderate it", canModerateTournament(organizer, theirs));
check("an admin may moderate anything", canModerateTournament(admin, someoneElses));
check("a nobody may not moderate", !canModerateTournament(nobody, someoneElses));

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
