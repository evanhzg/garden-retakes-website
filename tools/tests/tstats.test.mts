/**
 * Tournament stat aggregation.
 *
 * The failure this exists to catch does not look like a bug: averaging the
 * per-map ratings. A player who rates 1.40 over 12 rounds and 0.60 over 30 has
 * a tournament rating of 0.83, not 1.00 — and the wrong figure is entirely
 * plausible, sits in the middle of a table people screenshot, and nothing
 * downstream can tell it was computed the wrong way.
 *
 * The other one is a divide by zero: no deaths over a short series is a real
 * result, and "Infinity" in a K/D column is a bug report.
 */
import { aggregate, type StatRow } from "@/lib/tournament/stats";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const row = (over: Partial<StatRow> & { steamId: string }): StatRow => ({
  teamId: null,
  kills: 0,
  deaths: 0,
  assists: 0,
  headshots: 0,
  damage: 0,
  utilityDamage: 0,
  entryKills: 0,
  entryDeaths: 0,
  clutches: 0,
  roundsPlayed: 0,
  kastRounds: 0,
  rating: 0,
  maps: 1,
  ...over,
});

// ---- The weighted mean ----
const uneven = aggregate([
  row({ steamId: "1", rating: 1.4, roundsPlayed: 12 }),
  row({ steamId: "1", rating: 0.6, roundsPlayed: 30 }),
]);

// (1.4*12 + 0.6*30) / 42 = 34.8 / 42 = 0.8285…
check("rating is weighted by rounds, not averaged", uneven[0].ratingAvg === 0.83, String(uneven[0].ratingAvg));
check("the naive mean would have been 1.00 — and is not what we got", uneven[0].ratingAvg !== 1);
check("rounds add up", uneven[0].roundsPlayed === 42);
check("maps are counted", uneven[0].maps === 2);

// KAST has the same shape and the same trap.
const kast = aggregate([
  row({ steamId: "1", kastRounds: 12, roundsPlayed: 12 }),
  row({ steamId: "1", kastRounds: 0, roundsPlayed: 12 }),
]);
check("KAST is per-round across the whole set", kast[0].kast === 50, String(kast[0].kast));

// ---- Division ----
const flawless = aggregate([row({ steamId: "1", kills: 9, deaths: 0, roundsPlayed: 5 })]);
check("no deaths does not print Infinity", Number.isFinite(flawless[0].kd) && flawless[0].kd === 9);

const silent = aggregate([row({ steamId: "1", kills: 0, headshots: 0, roundsPlayed: 5 })]);
check("no kills gives 0% headshots, not NaN", silent[0].hs === 0);

const nothing = aggregate([row({ steamId: "1" })]);
check("a row of zeroes does not divide by zero", Number.isFinite(nothing[0].adr) && nothing[0].adr === 0);

// ---- Sums, ordering and identity ----
const two = aggregate(
  [
    row({ steamId: "1", kills: 10, deaths: 5, damage: 1000, roundsPlayed: 10, rating: 1.2 }),
    row({ steamId: "2", kills: 30, deaths: 5, damage: 3000, roundsPlayed: 10, rating: 1.9 }),
  ],
  { "1": "Alice", "2": "Bo" },
);

check("one line per player", two.length === 2);
check("sorted by rating, best first", two[0].steamId === "2");
check("names come from the lookup", two[0].name === "Bo" && two[1].name === "Alice");
check("ADR is damage over rounds", two[1].adr === 100, String(two[1].adr));
check("a player with no name falls back to their id", aggregate([row({ steamId: "77" })])[0].name === "77");

// A player's team comes from whichever row first knew it — the plugin reports
// SteamIDs and leaves TeamId null, so the first non-null must win rather than
// the last row overwriting it with nothing.
const teamed = aggregate([
  row({ steamId: "1", teamId: null }),
  row({ steamId: "1", teamId: 7 }),
  row({ steamId: "1", teamId: null }),
]);
check("a known team is not overwritten by a null one", teamed[0].teamId === 7, String(teamed[0].teamId));

check("no rows gives no lines", aggregate([]).length === 0);

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
