/**
 * Bracket generation.
 *
 * A bracket is built once and then played for hours, so a mistake here is not a
 * bug you notice and fix — it is a tournament that has to be restarted. These
 * check the things that would survive a glance at the page: every team appearing
 * exactly once, byes landing on the top seeds rather than wherever the
 * arithmetic put them, and every match except the final pointing somewhere.
 */
import {
  bracketSize,
  seedOrder,
  singleElimination,
  roundRobin,
  standings,
  resolveByes,
} from "@/lib/tournament/bracket";
import type { SeededTeam } from "@/lib/tournament/bracket";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const teams = (n: number): SeededTeam[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, seed: i + 1, name: `Team ${i + 1}` }));

// ---- sizes and seeding -----------------------------------------------------

check("eight teams need eight slots", bracketSize(8) === 8);
check("five teams need eight slots", bracketSize(5) === 8);
check("nine teams need sixteen slots", bracketSize(9) === 16);
check("two teams is the floor", bracketSize(1) === 2);

const order8 = seedOrder(8);
check("a bracket of eight seeds eight", order8.length === 8);
check("every seed appears once", new Set(order8).size === 8);
check("the first seed leads", order8[0] === 1);
check("the first pairing is 1 v 8", order8[0] + order8[1] === 9);
check("every pairing sums to size + 1", order8.every((s, i) => (i % 2 === 0 ? s + order8[i + 1] === 9 : true)));

// The property that makes seeding worth doing at all.
const order16 = seedOrder(16);
const topHalf = order16.slice(0, 8);
check("the top two seeds are in opposite halves", topHalf.includes(1) && !topHalf.includes(2));

// ---- single elimination ----------------------------------------------------

const eight = singleElimination(teams(8), 3);

check("eight teams make seven matches", eight.length === 7, `got ${eight.length}`);
check("three rounds", new Set(eight.map((m) => m.round)).size === 3);
check("one final", eight.filter((m) => m.round === 3).length === 1);
check("no byes with a full bracket", eight.every((m) => !m.isBye));

const firstRound = eight.filter((m) => m.round === 1);
const placed = firstRound.flatMap((m) => [m.teamAId, m.teamBId]).filter((id) => id !== null);
check("every team is placed once", new Set(placed).size === 8 && placed.length === 8);

check(
  "every match but the final points forward",
  eight.every((m) => (m.round === 3 ? m.nextRef === null : m.nextRef !== null)),
);

check(
  "the two feeders of a match take different slots",
  (() => {
    const bySlot = new Map<string, number>();
    for (const m of eight) {
      if (m.nextRef === null) continue;
      const key = `${m.nextRef}:${m.nextSlot}`;
      bySlot.set(key, (bySlot.get(key) ?? 0) + 1);
    }
    return [...bySlot.values()].every((n) => n === 1);
  })(),
);

// The whole point of seeding: the top two can only meet at the end.
const seedOf = new Map(teams(8).map((t) => [t.id, t.seed]));
const firstRoundSeeds = firstRound.map((m) => [seedOf.get(m.teamAId!), seedOf.get(m.teamBId!)]);
check(
  "the top two seeds do not meet in round one",
  !firstRoundSeeds.some((pair) => pair.includes(1) && pair.includes(2)),
);
check("seed 1 plays seed 8 first", firstRoundSeeds.some((p) => p.includes(1) && p.includes(8)));

// ---- byes ------------------------------------------------------------------

const five = singleElimination(teams(5), 1);
const fiveFirst = five.filter((m) => m.round === 1);
const byes = fiveFirst.filter((m) => m.isBye);

check("five teams fill a bracket of eight", five.length === 7);
check("three of the four first-round matches are byes", byes.length === 3, `got ${byes.length}`);

// Byes must go to the strongest teams. A bye handed to seed 5 instead of seed 1
// is a bracket that looks right and is unfair, which is the worst combination.
const byeTeams = byes.map((m) => m.teamAId ?? m.teamBId).map((id) => seedOf.get(id!));
check("byes go to the top seeds", byeTeams.every((s) => s !== undefined && s <= 3), JSON.stringify(byeTeams));

const fivePlaced = fiveFirst.flatMap((m) => [m.teamAId, m.teamBId]).filter((id) => id !== null);
check("every team still appears exactly once", new Set(fivePlaced).size === 5);

const resolved = resolveByes(singleElimination(teams(5), 1));
const secondRound = resolved.filter((m) => m.round === 2);
check(
  "a bye walks its team into the next round",
  secondRound.some((m) => m.teamAId !== null || m.teamBId !== null),
);

// ---- odd sizes -------------------------------------------------------------

for (const n of [2, 3, 4, 6, 7, 9, 12, 16]) {
  const plan = singleElimination(teams(n), 1);
  const placedIds = plan
    .filter((m) => m.round === 1)
    .flatMap((m) => [m.teamAId, m.teamBId])
    .filter((id) => id !== null);

  check(`${n} teams: everybody is placed once`, new Set(placedIds).size === n, `got ${new Set(placedIds).size}`);
  check(`${n} teams: one final`, plan.filter((m) => m.nextRef === null).length === 1);
}

// ---- best-of ---------------------------------------------------------------

const withFinal = singleElimination(teams(8), 3, 5);
check("the final can differ from the rest", withFinal.find((m) => m.round === 3)!.bestOf === 5);
check("the rest keep the stage's best-of", withFinal.filter((m) => m.round < 3).every((m) => m.bestOf === 3));

// ---- round robin -----------------------------------------------------------

const group4 = roundRobin(teams(4), 1);
check("four teams play six matches", group4.length === 6, `got ${group4.length}`);
check("in three rounds", new Set(group4.map((m) => m.round)).size === 3);

check(
  "every pair meets exactly once",
  (() => {
    const seen = new Set(group4.map((m) => [m.teamAId, m.teamBId].sort((a, b) => a! - b!).join("-")));
    return seen.size === 6;
  })(),
);

// The property that makes a group schedulable across parallel servers at all.
check(
  "nobody plays twice in one round",
  (() => {
    const byRound = new Map<number, number[]>();
    for (const m of group4) {
      const list = byRound.get(m.round) ?? [];
      list.push(m.teamAId!, m.teamBId!);
      byRound.set(m.round, list);
    }
    return [...byRound.values()].every((ids) => new Set(ids).size === ids.length);
  })(),
);

const group5 = roundRobin(teams(5), 1);
check("five teams play ten matches", group5.length === 10, `got ${group5.length}`);
check(
  "an odd group still never doubles up in a round",
  (() => {
    const byRound = new Map<number, number[]>();
    for (const m of group5) {
      const list = byRound.get(m.round) ?? [];
      list.push(m.teamAId!, m.teamBId!);
      byRound.set(m.round, list);
    }
    return [...byRound.values()].every((ids) => new Set(ids).size === ids.length);
  })(),
);

// ---- standings -------------------------------------------------------------

const table = standings(
  [1, 2, 3],
  [
    { teamAId: 1, teamBId: 2, scoreA: 13, scoreB: 4, finished: true },
    { teamAId: 2, teamBId: 3, scoreA: 13, scoreB: 11, finished: true },
    { teamAId: 1, teamBId: 3, scoreA: 13, scoreB: 9, finished: true },
  ],
);

check("the team with two wins is top", table[0].teamId === 1);
check("wins are counted", table[0].won === 2 && table[0].lost === 0);
check("round difference is counted", table[0].diff === 13 + 13 - 4 - 9);
check("the winless team is last", table[2].teamId === 3);

const unfinished = standings(
  [1, 2],
  [{ teamAId: 1, teamBId: 2, scoreA: 5, scoreB: 2, finished: false }],
);
check("a match in progress counts for nothing", unfinished.every((r) => r.played === 0));

// Difference separates equal records, which is the common case in a group of
// three where everybody wins one.
const circular = standings(
  [1, 2, 3],
  [
    { teamAId: 1, teamBId: 2, scoreA: 13, scoreB: 1, finished: true },
    { teamAId: 2, teamBId: 3, scoreA: 13, scoreB: 11, finished: true },
    { teamAId: 3, teamBId: 1, scoreA: 13, scoreB: 12, finished: true },
  ],
);
check("a circular tie is broken by round difference", circular[0].teamId === 1, `got ${circular[0].teamId}`);

console.log(fails === 0 ? "\nall passed" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
