/**
 * The role draft.
 *
 * Three things here are easy to get wrong and impossible to notice from a
 * screenshot.
 *
 * The snake. A1 | B1 B2 | A2 A3 | B3 is not an alternation, and an alternation
 * would look entirely plausible while quietly handing the first team the last
 * free role every single match. The shape is asserted directly.
 *
 * Uniqueness is PER TEAM and PER SIDE. Both teams may field a sniper; one team
 * may not field two. Confusing those two rules produces a draft that either
 * refuses legal picks or accepts the conflict the plugin then refuses at
 * go-live, which is a match that will not start for a reason nobody can see.
 *
 * And the auto-pick has to exist for every turn. A run-out clock with nothing
 * legal left to take is a draft that stalls for ever, which is a bracket that
 * stalls behind it.
 */
import {
  CT_ROLES,
  T_ROLES,
  autoRolePick,
  availableRoles,
  draftOrder,
  draftState,
  roleLabel,
  rolesComplete,
  validateRolePick,
  type RolePick,
} from "@/lib/tournament/roles";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const A3 = ["a1", "a2", "a3"];
const B3 = ["b1", "b2", "b3"];

// ------------------------------------------------------------------- order

const shape = (a: string[], b: string[]) =>
  draftOrder(a, b)
    .map((s) => s.team)
    .join("");

check("three a side snakes A BB AA B", shape(A3, B3) === "ABBAAB", shape(A3, B3));

const A5 = ["a1", "a2", "a3", "a4", "a5"];
const B5 = ["b1", "b2", "b3", "b4", "b5"];
check("five a side snakes A BB AA BB AA B", shape(A5, B5) === "ABBAABBAAB", shape(A5, B5));

check("one a side is just A then B", shape(["a1"], ["b1"]) === "AB", shape(["a1"], ["b1"]));
check("two a side snakes A BB A", shape(["a1", "a2"], ["b1", "b2"]) === "ABBA");

const order = draftOrder(A3, B3);
check("every player gets exactly one turn", order.length === 6);
check("the first turn is team A's first player", order[0].steamId === "a1" && order[0].team === "A");
check("the second and third are B's first two", order[1].steamId === "b1" && order[2].steamId === "b2");
check("the fourth and fifth are A's remaining two", order[3].steamId === "a2" && order[4].steamId === "a3");
check("the last is B's third", order[5].steamId === "b3" && order[5].team === "B");
check("ordinals count from zero without gaps", order.every((s, i) => s.ordinal === i));

// A team that has already drafted is simply absent from the order, which is how
// "roles for the whole tournament" works without a second code path.
const oneSided = draftOrder([], B3);
check("an empty roster drops out of the order", oneSided.length === 3 && oneSided.every((s) => s.team === "B"));
check("two empty rosters terminate rather than spin", draftOrder([], []).length === 0);

// ------------------------------------------------------------------- state

const pick = (steamId: string, roleT: string, roleCt: string, ordinal = 0): RolePick => ({
  ordinal,
  steamId,
  roleT,
  roleCt,
});

const empty = draftState(A3, B3, []);
check("nothing picked means the first turn is next", empty.next?.steamId === "a1");
check("nothing picked is not done", !empty.done);

const after = draftState(A3, B3, [pick("a1", "planter", "roamer")]);
check("one pick moves the clock to B's first", after.next?.steamId === "b1", String(after.next?.steamId));
check("A has claimed planter on T", after.taken.A.T.includes("planter"));
check("B has claimed nothing", after.taken.B.T.length === 0 && after.taken.B.CT.length === 0);

const all: RolePick[] = [
  pick("a1", "planter", "roamer", 0),
  pick("b1", "planter", "roamer", 1),
  pick("b2", "sniper", "frontrunner", 2),
  pick("a2", "sniper", "frontrunner", 3),
  pick("a3", "rifler", "backup", 4),
  pick("b3", "rifler", "backup", 5),
];
const finished = draftState(A3, B3, all);
check("a full set of picks is done", finished.done && finished.next === null);

// --------------------------------------------------------------- uniqueness

const oneEach = draftState(A3, B3, [pick("a1", "planter", "roamer")]);

check(
  "a unique role taken by my team is gone for my team",
  !availableRoles(oneEach, "A", "T").some((r) => r.id === "planter"),
);
check(
  "the same role is still free for the other team",
  availableRoles(oneEach, "B", "T").some((r) => r.id === "planter"),
);
check(
  "a non-unique role stays available after it is taken",
  availableRoles(draftState(A3, B3, [pick("a1", "rifler", "backup")]), "A", "T").some(
    (r) => r.id === "rifler",
  ),
);

// Roamer joined the unique roles. A CT side fielding three of them is a side
// with nobody holding the bombsite.
check("roamer is unique", CT_ROLES.find((r) => r.id === "roamer")?.unique === true);
check("frontrunner is unique", CT_ROLES.find((r) => r.id === "frontrunner")?.unique === true);
check("backup is the CT generalist", CT_ROLES.find((r) => r.id === "backup")?.unique === false);
check("rifler is the T generalist", T_ROLES.find((r) => r.id === "rifler")?.unique === false);

// The AWPer is called Sniper on both sides now. The id stays `awper` because the
// plugin keys its role kits by id across both sides and cannot hold two called
// `sniper` — so the label is the rename and the wire is untouched.
check("the CT sniper's id is still awper", CT_ROLES.some((r) => r.id === "awper"));
check("the CT sniper reads as Sniper", roleLabel("awper") === "Sniper");
check("the T sniper reads as Sniper", roleLabel("sniper") === "Sniper");
check("an unknown role falls back to its id", roleLabel("nonsense") === "nonsense");
check("no role falls back to nothing", roleLabel(null) === "");

// --------------------------------------------------------------- validation

const one = [pick("a1", "planter", "roamer")];

check(
  "picking out of turn is refused",
  validateRolePick(A3, B3, one, { steamId: "a2", roleT: "sniper", roleCt: "backup" }).ok === false,
);
check(
  "the player on the clock may pick",
  validateRolePick(A3, B3, one, { steamId: "b1", roleT: "planter", roleCt: "roamer" }).ok === true,
);

// The other team taking the same unique role is legal; the same team taking it
// twice is not.
const twoOfMine = [pick("a1", "planter", "roamer", 0), pick("b1", "sniper", "backup", 1), pick("b2", "planter", "roamer", 2)];
check(
  "a team cannot take its own unique role twice",
  validateRolePick(A3, B3, twoOfMine, { steamId: "a2", roleT: "planter", roleCt: "backup" }).ok === false,
);
check(
  "a role from the wrong side is refused",
  validateRolePick(A3, B3, one, { steamId: "b1", roleT: "roamer", roleCt: "backup" }).ok === false,
);
check(
  "a role that does not exist is refused",
  validateRolePick(A3, B3, one, { steamId: "b1", roleT: "goalkeeper", roleCt: "backup" }).ok === false,
);
check(
  "a finished draft refuses everything",
  validateRolePick(A3, B3, all, { steamId: "a1", roleT: "rifler", roleCt: "backup" }).ok === false,
);

// ----------------------------------------------------------------- auto-pick

// The failure this guards is a stalled bracket: a run-out clock with nothing
// legal left to take never advances, and no timeout can rescue it.
let running: RolePick[] = [];
for (let i = 0; i < 6; i++) {
  const auto = autoRolePick(A3, B3, running);
  if (!auto) break;

  const legal = validateRolePick(A3, B3, running, auto);
  check(`auto-pick ${i + 1} is legal`, legal.ok === true, legal.ok ? "" : legal.error);

  running = [...running, { ordinal: i, steamId: auto.steamId, roleT: auto.roleT, roleCt: auto.roleCt }];
}
check("auto-picking runs the whole draft", running.length === 6, String(running.length));
check("auto-picking finishes it", draftState(A3, B3, running).done);
check("there is nothing to auto-pick once it is done", autoRolePick(A3, B3, running) === null);

// A five-a-side team has more players than unique CT roles, so the generalist
// has to absorb the rest rather than the auto-pick running out.
let big: RolePick[] = [];
for (let i = 0; i < 12; i++) {
  const auto = autoRolePick(A5, B5, big);
  if (!auto) break;
  big = [...big, { ordinal: i, steamId: auto.steamId, roleT: auto.roleT, roleCt: auto.roleCt }];
}
check("five a side auto-drafts in full", big.length === 10, String(big.length));

// ------------------------------------------------------------------ carrying

check("a team with every role set is complete", rolesComplete([{ roleT: "planter", roleCt: "roamer" }]));
check("a half-filled team is not", !rolesComplete([{ roleT: "planter", roleCt: null }]));
check("an empty team is not complete", !rolesComplete([]));

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
