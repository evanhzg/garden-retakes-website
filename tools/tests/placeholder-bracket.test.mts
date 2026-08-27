/**
 * The empty-state bracket preview.
 *
 * A tournament with no stages now draws the tree it is going to have, and the
 * whole value of that is being the shape the real draw will take. If the
 * preview and the real bracket disagree about how many rounds eleven teams
 * need, the preview is worse than the line of grey text it replaced — it is
 * confidently wrong.
 *
 * So these check it against singleElimination itself rather than against
 * arithmetic written out a second time here.
 */
import { placeholderBracket, bracketSize, singleElimination } from "@/lib/tournament/bracket";
import type { SeededTeam } from "@/lib/tournament/bracket";

let fails = 0;
const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) fails++;
};

// ---------------------------------------------------------------- shape

for (const teams of [2, 3, 4, 5, 8, 11, 16]) {
  const preview = placeholderBracket(teams);
  const size = bracketSize(Math.max(2, teams));

  const real = singleElimination(
    Array.from({ length: size }, (_, i): SeededTeam => ({ id: i + 1, seed: i + 1, name: "x" })),
    1,
  );

  ok(
    `${teams} teams: preview has the same match count as a real bracket (${real.length})`,
    preview.length === real.length,
  );

  const rounds = new Set(preview.map((m) => m.round));
  ok(
    `${teams} teams: ${Math.log2(size)} rounds`,
    rounds.size === Math.log2(size),
  );
}

// ---------------------------------------------------------------- empty

const eight = placeholderBracket(8);

ok("every slot is empty", eight.every((m) => m.teamA === null && m.teamB === null));
ok("no scores", eight.every((m) => m.scoreA === 0 && m.scoreB === 0));
ok("no winners", eight.every((m) => m.winnerTeamId === null));
ok("every match is pending", eight.every((m) => m.state === "pending"));

// Negative ids are what tell a placeholder from a real match without a second
// flag, and what stops a preview box linking to /match/3.
ok("ids are negative", eight.every((m) => m.id < 0));
ok("ids are unique", new Set(eight.map((m) => m.id)).size === eight.length);

// ------------------------------------------------------------ degenerate

ok("zero teams still draws a two-team tree", placeholderBracket(0).length === 1);
ok("one team still draws a two-team tree", placeholderBracket(1).length === 1);

// -------------------------------------------------------------- best-of

const bo3 = placeholderBracket(4, 3);
ok("carries the series length", bo3.every((m) => m.bestOf === 3));

const withFinal = placeholderBracket(4, 1, 5);
const lastRound = Math.max(...withFinal.map((m) => m.round));
const final = withFinal.find((m) => m.round === lastRound)!;
ok("the final can differ from the rest", final.bestOf === 5);
ok(
  "and the earlier rounds do not",
  withFinal.filter((m) => m.round < lastRound).every((m) => m.bestOf === 1),
);

console.log(fails === 0 ? "\nall passed" : `\n${fails} failed`);
process.exitCode = fails === 0 ? 0 : 1;
