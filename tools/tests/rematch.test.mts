/**
 * The rematch.
 *
 * Two things worth pinning. The ban order is a compensation rule — the loser
 * cuts first because they are already a map down — and an off-by-one in it
 * hands the advantage to the team that was ahead, silently and in the direction
 * nobody would notice. And the vote is unanimous with a premade shortcut, where
 * the failure that matters is a leader's yes covering somebody it should not,
 * or a leader's NO ending four other people's evening.
 */
import {
  REMATCH_SEQUENCE,
  REMATCH_POOL_SIZE,
  canOfferRematch,
  coveredBy,
  rematchPool,
  rematchSteps,
  rematchVote,
  waitingOn,
  type Voter,
} from "@/lib/tournament/rematch";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const POOL = ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_dust2", "de_train"];

// ---- the sequence ---------------------------------------------------------

check("five decisions: four bans and a pick", REMATCH_SEQUENCE.length === 5);
check(
  "the loser bans first — they are the ones a map down",
  REMATCH_SEQUENCE[0].who === "loser" && REMATCH_SEQUENCE[0].kind === "ban",
);
check(
  "then the winner twice",
  REMATCH_SEQUENCE[1].who === "winner" && REMATCH_SEQUENCE[2].who === "winner",
);
check("then the loser again", REMATCH_SEQUENCE[3].who === "loser");
check(
  "and the winner picks",
  REMATCH_SEQUENCE[4].who === "winner" && REMATCH_SEQUENCE[4].kind === "pick",
);
check("1-2-1 bans", REMATCH_SEQUENCE.filter((s) => s.kind === "ban").length === 4);

// Nobody chooses sides: both maps knife. A "side" step appearing here would
// mean somebody had been handed the half they wanted by rule.
check("no side steps — both maps knife", REMATCH_SEQUENCE.every((s) => s.kind !== "side"));

const stepsA = rematchSteps("a");
check("resolved to slots, the loser of a is b", stepsA[0].team === "b");
check("and the winner's two bans are a", stepsA[1].team === "a" && stepsA[2].team === "a");
check("the pick belongs to the winner", stepsA[4].team === "a" && stepsA[4].kind === "pick");

const stepsB = rematchSteps("b");
check("it mirrors when b won", stepsB[0].team === "a" && stepsB[4].team === "b");

// ---- the pool -------------------------------------------------------------

const after = rematchPool(POOL, ["de_mirage"]);
check("the map just played is gone", !after.includes("de_mirage"));
check("six left, which is exactly what the sequence needs", after.length === REMATCH_POOL_SIZE);
check("pool order is kept", after.join() === POOL.filter((m) => m !== "de_mirage").join());
check("a map that was never in the pool changes nothing", rematchPool(POOL, ["de_cache"]).length === 7);

// ---- whether it can be offered -------------------------------------------

const base = { state: "finished", played: ["de_mirage"], pool: POOL, alreadyRematched: false };

check("a finished BO1 can be rematched", canOfferRematch(base).ok === true);
check("a live match cannot", canOfferRematch({ ...base, state: "live" }).ok === false);
check("nor a match still in its veto", canOfferRematch({ ...base, state: "veto" }).ok === false);
check("nor one already rematched", canOfferRematch({ ...base, alreadyRematched: true }).ok === false);
check(
  "a series is refused rather than guessed at",
  canOfferRematch({ ...base, played: ["de_mirage", "de_nuke"] }).ok === false,
);

// The pool check is what stops a rematch that cannot complete its own
// sequence: five maps minus the one played is four, and the bans alone need
// four with two more to play on.
const small = canOfferRematch({ ...base, pool: POOL.slice(0, 5) });
check("too small a pool is refused", small.ok === false);
check(
  "and says how many are missing",
  small.ok === false && /6 maps/.test(small.error) && /there are 4/.test(small.error),
  small.ok === false ? small.error : "",
);

// ---- the vote -------------------------------------------------------------

const solo = (id: string, over: Partial<Voter> = {}): Voter => ({
  steamId: id,
  partyId: null,
  isPartyLeader: false,
  isBot: false,
  ...over,
});

const four = [solo("1"), solo("2"), solo("3"), solo("4")];

check(
  "nobody has answered, so everybody is waited on",
  waitingOn(four, { accepted: [], declined: [] }).length === 4,
);
check(
  "three yes is still pending",
  rematchVote(four, { accepted: ["1", "2", "3"], declined: [] }).kind === "pending",
);
check(
  "four yes is accepted",
  rematchVote(four, { accepted: ["1", "2", "3", "4"], declined: [] }).kind === "accepted",
);

const oneNo = rematchVote(four, { accepted: ["1", "2", "3"], declined: ["4"] });
check("a single no ends it", oneNo.kind === "declined");
check("and names who", oneNo.kind === "declined" && oneNo.by === "4");

// ---- bots -----------------------------------------------------------------

const withBots = [solo("1"), solo("b1", { isBot: true }), solo("b2", { isBot: true })];
check(
  "bots are never waited on",
  rematchVote(withBots, { accepted: ["1"], declined: [] }).kind === "accepted",
);
check(
  "a lobby of nothing but bots needs nobody",
  rematchVote([solo("b1", { isBot: true })], { accepted: [], declined: [] }).kind === "accepted",
);

// ---- the premade shortcut -------------------------------------------------

const party = [
  solo("cap", { partyId: "p1", isPartyLeader: true }),
  solo("m1", { partyId: "p1" }),
  solo("m2", { partyId: "p1" }),
  solo("other"),
];

const capYes = { accepted: ["cap"], declined: [] };

check(
  "the leader's yes covers their party",
  coveredBy(party, capYes.accepted).size === 3,
);
check(
  "so only the player outside it is still waited on",
  waitingOn(party, capYes).join() === "other",
);
check(
  "and the vote passes once they agree",
  rematchVote(party, { accepted: ["cap", "other"], declined: [] }).kind === "accepted",
);

// A member's own yes covers only themselves — otherwise anybody in a party
// could speak for it.
check(
  "a non-leader's yes covers nobody else",
  coveredBy(party, ["m1"]).size === 0,
);
check(
  "so their team-mates are still waited on",
  waitingOn(party, { accepted: ["m1"], declined: [] }).sort().join() === "cap,m2,other",
);

// The important asymmetry: a leader may accept for their party and may NOT
// decline for it. Leaving is an individual decision.
const capNo = rematchVote(party, { accepted: [], declined: ["cap"] });
check("a leader's no is still just their own no", capNo.kind === "declined");
check(
  "declining does not cover the party",
  coveredBy(party, []).size === 0,
);

// Two parties, one leader in each.
const twoParties = [
  solo("capA", { partyId: "pa", isPartyLeader: true }),
  solo("a2", { partyId: "pa" }),
  solo("capB", { partyId: "pb", isPartyLeader: true }),
  solo("b2", { partyId: "pb" }),
];
check(
  "one leader's yes does not cover the other party",
  waitingOn(twoParties, { accepted: ["capA"], declined: [] }).sort().join() === "b2,capB",
);
check(
  "both leaders is everybody",
  rematchVote(twoParties, { accepted: ["capA", "capB"], declined: [] }).kind === "accepted",
);

// A leader flag with no party is meaningless and must not cover anyone.
check(
  "a leader of no party covers nobody",
  coveredBy([solo("x", { isPartyLeader: true }), solo("y")], ["x"]).size === 0,
);

console.log(fails === 0 ? "\nrematch: all good" : `\nrematch: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
