/**
 * Who finished where.
 *
 * The case that matters is the one that shipped broken: an ongoing tournament
 * showed a champion. The final was taken as the highest round among FINISHED
 * matches, so a bracket with only its first round played reported a round-one
 * winner as the tournament winner — complete with a trophy and a podium, on a
 * page that also said the tournament was still running.
 *
 * It looks entirely plausible on screen, which is why it needs a test rather
 * than a glance.
 */
import { podiumFrom } from "@/lib/tournament/hub";

let fails = 0;
const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) fails++;
};

const teams = [
  { Id: 1, Name: "Ashgrove", Tag: "ASH" },
  { Id: 2, Name: "Blackpine", Tag: "BLK" },
  { Id: 3, Name: "Coldwater", Tag: "CLD" },
  { Id: 4, Name: "Drakemoor", Tag: "DRK" },
];

/** A four-team bracket: two semis in round 1, a final in round 2. */
const semis = [
  { Round: 1, TeamAId: 1, TeamBId: 2, WinnerTeamId: 1 },
  { Round: 1, TeamAId: 3, TeamBId: 4, WinnerTeamId: 3 },
];

// ---------------------------------------------------- the regression itself

const ongoing = [...semis, { Round: 2, TeamAId: 1, TeamBId: 3, WinnerTeamId: null }];

ok("an unplayed final means no podium", podiumFrom(ongoing, teams).length === 0);

// The shape that caused it: the final row absent entirely rather than unplayed.
ok("semis alone are not a final", podiumFrom(semis, teams).length === 0);

// ---------------------------------------------------------------- finished

const done = [...semis, { Round: 2, TeamAId: 1, TeamBId: 3, WinnerTeamId: 1 }];
const podium = podiumFrom(done, teams);

ok("a finished bracket has a podium", podium.length > 0);
ok("the winner is the final's winner", podium[0]?.place === 1 && podium[0]?.name === "Ashgrove");
ok("second is the team it beat", podium[1]?.place === 2 && podium[1]?.name === "Coldwater");

// Both losing semi-finalists share third: no third-place match is played, so
// ranking one above the other would be a claim the bracket never made.
const thirds = podium.filter((p) => p.place === 3).map((p) => p.name).sort();
ok("both losing semi-finalists take third", thirds.length === 2);
ok("and they are the right two", thirds.join(",") === "Blackpine,Drakemoor");
ok("nobody is placed twice", new Set(podium.map((p) => p.teamId)).size === podium.length);

// ------------------------------------------------------------- degenerate

ok("no matches means no podium", podiumFrom([], teams).length === 0);
ok(
  "a single unplayed match means no podium",
  podiumFrom([{ Round: 1, TeamAId: 1, TeamBId: 2, WinnerTeamId: null }], teams).length === 0,
);

const twoTeam = podiumFrom([{ Round: 1, TeamAId: 1, TeamBId: 2, WinnerTeamId: 2 }], teams);
ok("a two-team bracket has a winner and a runner-up", twoTeam.length === 2);
ok("and no third place to give", twoTeam.every((p) => p.place < 3));

// A team id the roster does not contain must not crash or invent a name.
ok(
  "an unknown team is skipped rather than guessed",
  podiumFrom([{ Round: 1, TeamAId: 99, TeamBId: 98, WinnerTeamId: 99 }], teams).length === 0,
);

console.log(fails === 0 ? "\nall passed" : `\n${fails} failed`);
process.exitCode = fails === 0 ? 0 : 1;
