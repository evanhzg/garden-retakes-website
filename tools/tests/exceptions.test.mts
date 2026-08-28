/**
 * The rules an organizer may break, and the ones nobody may.
 *
 * The distinction is the whole point of the module, so most of these tests are
 * about which side of it a given situation falls on — and in particular that the
 * override moves the "tournament has started" and "roster is full" rules and
 * does NOT move "already on another team".
 */
import {
  checkSubstitution,
  checkMatchTeamChange,
  looksLikeSteamId,
  type ExistingMembership,
} from "@/lib/tournament/exceptions";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const sub = (over: Partial<Parameters<typeof checkSubstitution>[0]> = {}) =>
  checkSubstitution({
    teamId: 1,
    teamName: "Greyhaven",
    teamSize: 3,
    currentRosterSize: 3,
    tournamentStarted: false,
    existing: [],
    override: false,
    steamIdValid: true,
    ...over,
  });

// -------------------------------------------------------------- substitutions

check("an ordinary add is allowed", sub().ok);

{
  const v = sub({ steamIdValid: false });
  check("a malformed id is refused", !v.ok);
  check("...and says what one looks like", v.blockers.some((b) => b.includes("17 digits")));
}

{
  // The default: no joining a tournament that has started.
  const v = sub({ tournamentStarted: true });
  check("a started tournament refuses by default", !v.ok);
  check("...and names the override", v.blockers.some((b) => b.includes("override")), v.blockers.join("|"));
}

{
  // ...which is exactly what the override is for.
  const v = sub({ tournamentStarted: true, override: true });
  check("the override admits a mid-tournament sub", v.ok, v.blockers.join("|"));
  check("...and says what was broken", v.warnings.some((w) => w.includes("already started")));
}

{
  const v = sub({ currentRosterSize: 5, teamSize: 3 });
  check("a full roster refuses by default", !v.ok);
}

{
  const v = sub({ currentRosterSize: 5, teamSize: 3, override: true });
  check("the override admits an over-full roster", v.ok);
  check("...and names the cap", v.warnings.some((w) => w.includes("roster cap of 5")), v.warnings.join("|"));
}

// The one thing an override must NOT do.
{
  const elsewhere: ExistingMembership[] = [{ teamId: 2, teamName: "Coldwater", status: "accepted" }];

  const plain = sub({ existing: elsewhere });
  check("a player on another team is refused", !plain.ok);

  const forced = sub({ existing: elsewhere, override: true });
  check("...and the override does NOT get past it", !forced.ok, forced.blockers.join("|"));
  check(
    "...because their stats would count twice",
    forced.blockers.some((b) => b.includes("both teams")),
    forced.blockers.join("|"),
  );
  check(
    "...and it says what to do instead",
    forced.blockers.some((b) => b.includes("Remove them from Coldwater first")),
  );
}

{
  // An invite they never answered still ties them to that team.
  const v = sub({ existing: [{ teamId: 2, teamName: "Coldwater", status: "invited" }], override: true });
  check("an unanswered invite elsewhere still blocks", !v.ok);
}

{
  // ...but one they turned down, or were removed from, does not.
  const declined = sub({ existing: [{ teamId: 2, teamName: "Coldwater", status: "declined" }] });
  check("a declined invite elsewhere does not block", declined.ok, declined.blockers.join("|"));

  const removed = sub({ existing: [{ teamId: 2, teamName: "Coldwater", status: "removed" }] });
  check("being removed elsewhere does not block", removed.ok, removed.blockers.join("|"));
}

{
  // Already here: not an error. The caller makes it a no-op.
  const v = sub({ existing: [{ teamId: 1, teamName: "Greyhaven", status: "accepted" }], tournamentStarted: true });
  check("already on this team is not an error", v.ok, v.blockers.join("|"));
}

{
  const v = sub({
    existing: [{ teamId: 1, teamName: "Greyhaven", status: "removed" }],
    override: true,
  });
  check("re-adding somebody previously removed is allowed", v.ok);
  check("...and says so", v.warnings.some((w) => w.includes("previously removed")));
}

// ------------------------------------------------------------ match team edits

const change = (over: Partial<Parameters<typeof checkMatchTeamChange>[0]> = {}) =>
  checkMatchTeamChange({
    matchState: "pending",
    incomingTeamId: 5,
    outgoingTeamId: 4,
    otherTeamId: 9,
    hasPlayed: false,
    hasAdvanced: false,
    override: false,
    ...over,
  });

check("swapping a team into a pending match is ordinary", change().ok);

{
  const v = change({ incomingTeamId: 9 });
  check("a team cannot play itself", !v.ok);
  check("...and the override does not help", change({ incomingTeamId: 9, override: true }).ok === false);
}

{
  const v = change({ incomingTeamId: 4 });
  check("putting back the team already there is a no-op", v.ok && v.warnings.length === 0);
}

{
  const v = change({ matchState: "live" });
  check("a live match refuses by default", !v.ok);

  const forced = change({ matchState: "live", override: true });
  check("...and the override allows it", forced.ok);
  check("...warning that players will move", forced.warnings.some((w) => w.includes("players will be moved")));
}

{
  const v = change({ hasPlayed: true, matchState: "ready" });
  check("rounds played refuse by default", !v.ok);

  const forced = change({ hasPlayed: true, matchState: "ready", override: true });
  check("...and the override allows it", forced.ok);
  check("...warning the scores stay", forced.warnings.some((w) => w.includes("stay with the match")));
}

{
  const v = change({ matchState: "finished", hasAdvanced: true, hasPlayed: true, override: true });
  check("a finished, advanced match warns about the next round", v.ok && v.warnings.some((w) => w.includes("next round")));
}

// ------------------------------------------------------------------- steam ids

check("a real-looking id passes", looksLikeSteamId("76561198000000001"));
check("with surrounding space", looksLikeSteamId("  76561198000000001  "));
check("16 digits is not one", !looksLikeSteamId("7656119800000000"));
check("18 digits is not one", !looksLikeSteamId("765611980000000012"));
check("letters are not one", !looksLikeSteamId("7656119800000000a"));
check("a clan id is refused", !looksLikeSteamId("10358279000000000"));
check("empty is not one", !looksLikeSteamId(""));

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
