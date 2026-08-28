/**
 * The matchmaker's pure parts.
 *
 * Everything here is a function whose failure mode is a lobby that behaves
 * slightly wrongly rather than an error anybody sees: a queue key that stops
 * round-tripping puts a party in a queue nobody else is in; an exclusion list
 * that is trusted rather than trimmed empties the veto pool; a floor that never
 * relaxes leaves two fussy captains queueing forever. None of those throw, and
 * none of them look wrong in a diff.
 *
 * The stateful half — parties, timers, sockets — is not covered here. It needs
 * a socket server to mean anything, and this file deliberately stops where that
 * begins.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mm = require("../../scripts/retakesMatchmaking.js");

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------ queues

const pool = mm.MAP_POOLS.retakes;

check("every generated queue is a size the game server accepts",
  Object.values(mm.QUEUES).every((q: any) => q.teamSize === 2 || q.teamSize === 3),
  Object.values(mm.QUEUES).map((q: any) => `${q.id}=${q.teamSize}`).join(" "));

check("six queues: two sizes, times classic/premium/testing",
  Object.keys(mm.QUEUES).length === 6, Object.keys(mm.QUEUES).join(" "));

check("a key round-trips to a queue that exists",
  Object.hasOwn(mm.QUEUES, mm.queueKey("trio", true, false)));

// Testing ignores premium rather than multiplying with it: a queue that fills
// itself with robots has no band worth tightening, and carrying the flag would
// split a queue that is already one party.
check("testing collapses premium instead of doubling the queues",
  mm.queueKey("duo", true, true) === mm.queueKey("duo", false, true),
  `${mm.queueKey("duo", true, true)} vs ${mm.queueKey("duo", false, true)}`);

check("only testing queues may invent players",
  Object.values(mm.QUEUES).every((q: any) => q.bots === q.testing));

check("premium is the tighter band, not a different game",
  mm.QUEUES[mm.queueKey("trio", true, false)].band.base <
  mm.QUEUES[mm.queueKey("trio", false, false)].band.base);

// The old names are still in RetakesLobbies.Mode. Falling back to the default
// is safe but silently drops a party into 3v3 when the link they followed said
// 2v2, which is worse than it looks: the party capacity changes under them.
check("legacy 2v2 rows resolve to a duo queue, not the default",
  mm.QUEUES[mm.resolveQueueId("2v2")].teamSize === 2, mm.resolveQueueId("2v2"));
check("legacy bots rows resolve to a testing queue",
  mm.QUEUES[mm.resolveQueueId("bots")].testing === true, mm.resolveQueueId("bots"));
check("legacy premium rows keep their band",
  mm.QUEUES[mm.resolveQueueId("premium")].premium === true, mm.resolveQueueId("premium"));
check("a name nobody has ever used falls back rather than throwing",
  mm.resolveQueueId("kangaroo") === mm.DEFAULT_QUEUE, mm.resolveQueueId("kangaroo"));

// ------------------------------------------------------------ map preferences

check("an exclusion list is capped at four however long it arrives",
  mm.sanitiseExcluded(pool.slice(0, 8), pool).length === mm.MAX_EXCLUDED_MAPS,
  String(mm.sanitiseExcluded(pool.slice(0, 8), pool).length));

check("a map that has left the pool is dropped, not carried",
  eq(mm.sanitiseExcluded(["de_dust2", "de_cbble"], pool), ["de_dust2"]),
  JSON.stringify(mm.sanitiseExcluded(["de_dust2", "de_cbble"], pool)));

check("order is the pool's, so two lists compare the same way",
  eq(mm.sanitiseExcluded(["de_vertigo", "de_ancient"], pool),
     mm.sanitiseExcluded(["de_ancient", "de_vertigo"], pool)));

check("junk in the column excludes nothing rather than everything",
  eq(mm.sanitiseExcluded(null, pool), []) && eq(mm.sanitiseExcluded([1, {}], pool), []));

check("what is left is the pool minus the drops",
  mm.allowedMaps(pool, ["de_dust2", "de_mirage"]).length === pool.length - 2);

// ------------------------------------------------------------------ the floor

// The floor is off.
//
// It used to demand several shared maps, relaxing with the wait, so two people
// who had each dropped a few could sit in a queue together indefinitely and
// never be told why — invisible, and indistinguishable from nobody else being
// online. At this population that is the wrong trade: a veto on one map is a
// formality, and no match at all is worse.
check("the floor never blocks a match", mm.requiredPoolSize(0) === 1);
check("...however long anybody has waited", mm.requiredPoolSize(60 * 60_000) === 1);
check("...and a negative wait is still just one", mm.requiredPoolSize(-5000) === 1);

// The case the floor used to exist for: two captains dropping four maps each,
// disjoint, leaves two. That is now a match rather than a refusal.
check(
  "two disjoint four-map drops still leave enough to match on",
  mm.allowedMaps(pool, pool.slice(0, 4)).filter((m: string) => !pool.slice(4, 8).includes(m)).length
  >= mm.requiredPoolSize(0));

// ------------------------------------------------------------------- rating

check("a solo party is rated at its own rating",
  mm.effectiveElo([1400]) === 1400);

check("an even trio is judged on its average",
  mm.effectiveElo([1500, 1500, 1500]) === 1500);

// A pair of 1800s queueing with a 900 is not an average-1500 team.
check("a lopsided party is judged nearer its top",
  mm.effectiveElo([1800, 1800, 900]) > (1800 + 1800 + 900) / 3,
  String(mm.effectiveElo([1800, 1800, 900])));

// There is no skill-based matchmaking. There are not enough people playing for
// it to sort anybody — it only ever stopped four friends in a queue from
// finding each other. effectiveElo above is still exercised because the number
// is still shown; it simply no longer decides who plays whom.
check(
  "any two parties are close enough, whatever their rating",
  mm.acceptableGap(mm.QUEUES[mm.DEFAULT_QUEUE], 0) === Number.POSITIVE_INFINITY);
check(
  "...and waiting does not change that",
  mm.acceptableGap(mm.QUEUES[mm.DEFAULT_QUEUE], 10_000) === Number.POSITIVE_INFINITY);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
