/**
 * Unique bot names.
 *
 * The bug this replaces: names were handed out as `pool[steamId % pool.length]`
 * with a pool of twenty-four. Fine until the twenty-fifth bot, and wrong ever
 * after — a sixteen-team 3v3 is forty-eight players, so every single name came
 * out exactly twice. Measured on the live database before this: 48 bots, 24
 * distinct names, all 24 duplicated.
 *
 * Two "Rezan"s in one bracket is not cosmetic. The scoreboard, the stats table
 * and the game server all identify a bot by the name shown, so a duplicate is a
 * row nobody can attribute — in the one kind of tournament that exists to be
 * checked by eye.
 *
 * The pool is now long enough that no realistic bracket reaches the end of it,
 * but "long enough" is an assumption and this is the guard, so the exhaustion
 * path is what most of these cases exercise.
 */
import { uniqueNames } from "@/lib/tournament/bots";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const POOL = ["Alpha", "Bravo", "Charlie"];

// ------------------------------------------------------------- the easy case

const three = uniqueNames(POOL, new Set(), 3);
check("hands out the pool in order", three.join(",") === "Alpha,Bravo,Charlie", three.join(","));
check("no duplicates within one call", new Set(three).size === 3);

// --------------------------------------------------------------- already used

const taken = new Set(["Alpha"]);
const skipped = uniqueNames(POOL, taken, 2);
check("skips a name already in use", skipped.join(",") === "Bravo,Charlie", skipped.join(","));
check("the caller's set is updated", taken.has("Bravo") && taken.has("Charlie"));

// ------------------------------------------------------------ past the end

// The original failure, reproduced at small scale: more names wanted than the
// pool holds. The old code silently wrapped; this must not.
const many = uniqueNames(POOL, new Set(), 8);
check("gives as many as asked for", many.length === 8, String(many.length));
check("every one is distinct", new Set(many).size === 8, many.join(","));
check("falls back to a numbered suffix", many.includes("Alpha 2"), many.join(","));
check("and keeps numbering past that", many.includes("Alpha 3"), many.join(","));

// ------------------------------------------------- accumulating across calls

// How addBotTeam actually uses it: one call per team, sharing one set, so the
// eighth team must not collide with the first.
const shared = new Set<string>();
const dealt: string[] = [];
for (let team = 0; team < 8; team++) {
  dealt.push(...uniqueNames(POOL, shared, 3));
}

check("24 names across 8 teams", dealt.length === 24, String(dealt.length));
check("all 24 distinct", new Set(dealt).size === 24, `${new Set(dealt).size} distinct`);

// ------------------------------------------------------ the team-name shape

// Team names are deduped as the FINAL string, suffix included, because that is
// what the unique index compares. Deduping the stem and appending afterwards
// produced eight identical "Ashgrove Bots" and a constraint violation on the
// second — caught by rehearsing the reset on a throwaway database.
const stems = ["Ashgrove", "Blackpine"];
const teamsTaken = new Set<string>();
const teamNames = [
  uniqueNames(stems.map((s) => `${s} Bots`), teamsTaken, 1)[0],
  uniqueNames(stems.map((s) => `${s} Bots`), teamsTaken, 1)[0],
  uniqueNames(stems.map((s) => `${s} Bots`), teamsTaken, 1)[0],
];

check("team names carry their suffix", teamNames[0] === "Ashgrove Bots", teamNames[0]);
check("and do not repeat", new Set(teamNames).size === 3, teamNames.join(","));

// --------------------------------------------------------------------- edges

check("asking for none gives none", uniqueNames(POOL, new Set(), 0).length === 0);
check("an empty pool cannot loop for ever", uniqueNames([], new Set(), 0).length === 0);

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
