/**
 * Standing teams.
 *
 * Two rules carry these tests. Who may act on whom — where the expensive
 * mistake is a manager being able to remove the captain — and one team per
 * player per tournament, where the expensive mistake is a bracket in which the
 * same person played for both semi-finalists.
 */
import {
  canActOn,
  checkTeamEntry,
  checkTeamName,
  cleanTag,
  isTeamRole,
  teamCan,
  teamSlug,
} from "@/lib/tournament/teams";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

// ------------------------------------------------------------------- the roles

check("captain is a role", isTeamRole("captain"));
check("owner is not", !isTeamRole("owner"));

check("a captain may do anything", teamCan("captain", "delete") && teamCan("captain", "transfer"));
check("a manager runs the team", teamCan("manager", "edit") && teamCan("manager", "invite") && teamCan("manager", "enter"));
check("...but may not give it away", !teamCan("manager", "transfer"));
check("...nor delete it", !teamCan("manager", "delete"));
check("a player is a member, not an officer", !teamCan("player", "invite"));
check("a stranger may do nothing", !teamCan(null, "edit"));

// ------------------------------------------------------- who may act on whom

check("a captain may remove a player", canActOn("captain", "player"));
check("a captain may demote a manager", canActOn("captain", "manager"));
check("a manager may remove a player", canActOn("manager", "player"));

// The one that would end a team: a manager removing the person who owns it.
check("a manager may NOT act on the captain", !canActOn("manager", "captain"));
check("nor may another captain-level actor", !canActOn("captain", "captain"));
check("a manager may not demote another manager", !canActOn("manager", "manager"));
check("a player may not act on anybody", !canActOn("player", "player"));
check("a stranger may not act on anybody", !canActOn(null, "player"));

// ---------------------------------------------------------------- entering one

const three = ["76561198000000001", "76561198000000002", "76561198000000003"];

{
  const v = checkTeamEntry({ teamSize: 3, chosen: three, alreadyEntered: {} });
  check("a full roster enters", v.ok, JSON.stringify(v));
}

{
  const v = checkTeamEntry({ teamSize: 3, chosen: three.slice(0, 2), alreadyEntered: {} });
  check("too few is refused", !v.ok);
  check("...and says how many are needed", !v.ok && v.error.includes("Pick 3"), !v.ok ? v.error : "");
}

{
  const v = checkTeamEntry({ teamSize: 2, chosen: three, alreadyEntered: {} });
  check("too many is refused", !v.ok, JSON.stringify(v));
}

{
  const v = checkTeamEntry({
    teamSize: 3,
    chosen: [three[0], three[1], three[1]],
    alreadyEntered: {},
  });
  check("the same player twice is refused", !v.ok);
  check("...and says so", !v.ok && v.error.includes("twice"), !v.ok ? v.error : "");
}

// The rule the whole feature turns on.
{
  const v = checkTeamEntry({
    teamSize: 3,
    chosen: three,
    alreadyEntered: { [three[1]]: [{ teamId: 9, teamName: "Coldwater" }] },
    nameOf: { [three[1]]: "pike" },
  });
  check("a player already in this tournament blocks the entry", !v.ok);
  check(
    "...naming the player and the team they are already with",
    !v.ok && v.error.includes("pike") && v.error.includes("Coldwater"),
    !v.ok ? v.error : "",
  );
}

{
  // Belonging to several standing teams is the point of them — only ENTERING
  // twice is refused, and that is what alreadyEntered means.
  const v = checkTeamEntry({ teamSize: 3, chosen: three, alreadyEntered: { [three[0]]: [] } });
  check("belonging to other teams is fine", v.ok, JSON.stringify(v));
}

{
  // Whitespace must not smuggle a duplicate past the check.
  const v = checkTeamEntry({
    teamSize: 3,
    chosen: [three[0], ` ${three[0]} `, three[2]],
    alreadyEntered: {},
  });
  check("a padded id is the same player", !v.ok, JSON.stringify(v));
}

// -------------------------------------------------------------- names and slugs

check("a plain name slugs", teamSlug("Coldwater Bots") === "coldwater-bots", teamSlug("Coldwater Bots"));
check("accents are folded, not dropped", teamSlug("Équipe Rouge") === "equipe-rouge", teamSlug("Équipe Rouge"));
check("punctuation collapses", teamSlug("A -- B") === "a-b", teamSlug("A -- B"));
check("no leading or trailing dashes", teamSlug("  hi  ") === "hi", teamSlug("  hi  "));
check("a slug is capped", teamSlug("x".repeat(200)).length <= 48);

check("a real name passes", checkTeamName("Coldwater").ok);
check("one character is refused", !checkTeamName("x").ok);
check("whitespace is refused", !checkTeamName("   ").ok);
check("a name of only punctuation is refused", !checkTeamName("---").ok);
check("an over-long name is refused", !checkTeamName("x".repeat(65)).ok);

check("a tag is upper case and short", cleanTag(" gg ") === "GG", cleanTag(" gg "));
check("a long tag is cut", cleanTag("abcdefghijkl").length === 8);

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
