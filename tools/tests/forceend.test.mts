/**
 * Forced results.
 *
 * The cases that matter are the ones an admin only ever hits once: awarding a
 * map to the team that is behind, awarding one in overtime, and awarding a
 * SERIES to a team that has already lost a map. Each of those has an obvious
 * wrong answer that looks right until it lands on a bracket.
 */
import { forcedMapScore, forcedSeriesScore, mapsToWin, MAP_WIN_ROUNDS } from "@/lib/tournament/forceEnd";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const same = (a: { a: number; b: number }, b: { a: number; b: number }) => a.a === b.a && a.b === b.b;
const show = (s: { a: number; b: number }) => `${s.a}-${s.b}`;

// ---------------------------------------------------------------- map scores

{
  const got = forcedMapScore({ a: 4, b: 3 }, "a");
  check("a forced win is 13 and the loser keeps theirs", same(got, { a: 13, b: 3 }), show(got));
}

{
  const got = forcedMapScore({ a: 3, b: 4 }, "b");
  check("...from either side", same(got, { a: 3, b: 13 }), show(got));
}

{
  // The award must not take rounds away from somebody who had already won more
  // than it grants.
  const got = forcedMapScore({ a: 15, b: 14 }, "a");
  check("a winner past 13 is left where they are", same(got, { a: 15, b: 14 }), show(got));
}

{
  // The case that quietly produces a drawn map: 13-13 is not a win, so the
  // award has to clear the loser rather than stopping at the constant.
  const got = forcedMapScore({ a: 6, b: 13 }, "a");
  check("an award always clears the loser", got.a > got.b, show(got));
}

{
  const got = forcedMapScore({ a: 6, b: 16 }, "a");
  check("...even deep in overtime", got.a === 17 && got.b === 16, show(got));
}

{
  const got = forcedMapScore({ a: 0, b: 0 }, "b");
  check("a map nobody played is 0-13", same(got, { a: 0, b: 13 }), show(got));
}

check("the constant is MR12's 13", MAP_WIN_ROUNDS === 13);

// ------------------------------------------------------------- series scores

check("a BO1 needs one map", mapsToWin(1) === 1);
check("a BO3 needs two", mapsToWin(3) === 2);
check("a BO5 needs three", mapsToWin(5) === 3);

{
  // The ordinary case: the recount already says what the award says, so the
  // award changes nothing. Touching it here would invent maps that were played.
  const got = forcedSeriesScore({ a: 2, b: 1 }, "a", 3);
  check("a winner already ahead keeps the real map count", same(got, { a: 2, b: 1 }), show(got));
}

{
  // The bracket case: awarded the series having lost map one. Leaving the count
  // alone puts "1-0 B" beside "winner: A" on the same line.
  const got = forcedSeriesScore({ a: 0, b: 1 }, "a", 3);
  check("a winner behind on maps is moved ahead", got.a > got.b, show(got));
  check("...to the number that takes the series", got.a === 2 && got.b === 1, show(got));
}

{
  const got = forcedSeriesScore({ a: 0, b: 0 }, "b", 1);
  check("a BO1 forced before a map finished is 0-1", same(got, { a: 0, b: 1 }), show(got));
}

{
  // Level on maps is not a win either.
  const got = forcedSeriesScore({ a: 1, b: 1 }, "b", 3);
  check("level on maps still resolves to a winner", got.b > got.a, show(got));
}

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
