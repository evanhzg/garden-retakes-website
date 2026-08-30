/**
 * The map veto.
 *
 * Worth testing more than most of this system, for two reasons. It is the part
 * of a tournament people argue about afterwards, and "the site says so" only
 * settles an argument if the site was right. And it decides the SIDES on every
 * picked map — a mistake there puts both teams on the wrong half and is
 * invisible until somebody spawns.
 */
import { sequenceFor, vetoState, validateAction, autoAction } from "@/lib/tournament/veto";
import type { VetoAction, Side } from "@/lib/tournament/veto";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const POOL = ["de_dust2", "de_inferno", "de_cache", "de_anubis", "de_mirage", "de_ancient", "de_nuke"];

/** Plays a veto out, taking the first legal option at every turn. */
function playOut(bestOf: number, pool = POOL, sides: Side[] = []) {
  const actions: VetoAction[] = [];
  let sideIndex = 0;

  for (let guard = 0; guard < 40; guard++) {
    const state = vetoState(pool, bestOf, actions);
    if (!state.next) break;

    if (state.next.kind === "side") {
      actions.push({
        ordinal: actions.length,
        teamId: state.next.team === "A" ? 1 : 2,
        kind: "side",
        side: sides[sideIndex++] ?? "T",
      });
      continue;
    }

    actions.push({
      ordinal: actions.length,
      teamId: state.next.team === "A" ? 1 : 2,
      kind: state.next.kind,
      map: state.remaining[0],
    });
  }

  return { actions, state: vetoState(pool, bestOf, actions) };
}

// ---- shape of the sequences ------------------------------------------------

const bo1 = sequenceFor(1, 7);
check("a BO1 bans six of seven", bo1.length === 6, `got ${bo1.length}`);
check("a BO1 never picks", bo1.every((s) => s.kind === "ban"));
check("a BO1 alternates", bo1.every((s, i) => s.team === (i % 2 === 0 ? "A" : "B")));

const bo3 = sequenceFor(3, 7);
check("a BO3 has two picks", bo3.filter((s) => s.kind === "pick").length === 2);
check("a BO3 has a side call per pick", bo3.filter((s) => s.kind === "side").length === 2);

// The rule that matters: you pick the map, they pick the half.
const pickIndex = bo3.findIndex((s) => s.kind === "pick");
check(
  "the team that did not pick chooses the side",
  bo3[pickIndex].team !== bo3[pickIndex + 1].team,
  `${bo3[pickIndex].team} picked and ${bo3[pickIndex + 1].team} chose`,
);

const bo5 = sequenceFor(5, 7);
check("a BO5 has four picks", bo5.filter((s) => s.kind === "pick").length === 4);

// ---- a pool that is not seven ---------------------------------------------
//
// The pool is admin-editable, so a hard-coded seven-map sequence would break
// silently the day somebody removes a map.

for (const size of [5, 7, 9]) {
  const pool = POOL.concat(["de_train", "de_overpass"]).slice(0, size);
  const { state } = playOut(3, pool);

  check(
    `a BO3 on a pool of ${size} yields three maps`,
    state.picked.length === 3,
    `got ${state.picked.length}`,
  );
  check(`a BO3 on a pool of ${size} finishes`, state.done);
}

const smallBo1 = playOut(1, POOL.slice(0, 3));
check("a BO1 on a pool of three yields one map", smallBo1.state.picked.length === 1);

// ---- what a played-out veto produces ---------------------------------------

const three = playOut(3);
check("a BO3 produces three maps", three.state.picked.length === 3);
check("a BO3 ends with a decider", three.state.picked[2].isDecider === true);
check("only the decider is a decider", three.state.picked.filter((p) => p.isDecider).length === 1);

check(
  "picked maps arrive with their sides settled",
  three.state.picked.slice(0, 2).every((p) => p.startSideTeamA !== null),
);

// This null is what the plugin reads to choose between css_t_side and
// css_t_knife, so it is the difference between a decider and a picked map.
check("the decider has no side, so it knifes", three.state.picked[2].startSideTeamA === null);

const one = playOut(1);
check("a BO1 produces one map", one.state.picked.length === 1);
check("a BO1 map is a decider", one.state.picked[0].isDecider === true);
check("a BO1 knifes for sides", one.state.picked[0].startSideTeamA === null);

check("a BO5 produces five maps", playOut(5).state.picked.length === 5);
check("no map is played twice", new Set(three.state.picked.map((p) => p.map)).size === 3);

// ---- the side translation --------------------------------------------------
//
// The chooser names the side THEY want; what is stored is the side team A starts
// on. Getting this backwards is invisible until somebody spawns.

const bSaysT = playOut(3, POOL, ["T", "T"]);
const firstPick = bSaysT.state.picked[0];
check(
  "when B chooses T, team A is stored as CT",
  firstPick.sideChosenBy === "B" ? firstPick.startSideTeamA === "CT" : true,
  `chosen by ${firstPick.sideChosenBy}, stored ${firstPick.startSideTeamA}`,
);

const bSaysCt = playOut(3, POOL, ["CT", "CT"]);
const firstCt = bSaysCt.state.picked[0];
check(
  "when B chooses CT, team A is stored as T",
  firstCt.sideChosenBy === "B" ? firstCt.startSideTeamA === "T" : true,
  `chosen by ${firstCt.sideChosenBy}, stored ${firstCt.startSideTeamA}`,
);

// ---- turn order ------------------------------------------------------------
//
// Two captains clicking at once is normal, so the second must be refused rather
// than applied out of turn.

const fresh: VetoAction[] = [];
const first = vetoState(POOL, 3, fresh).next!;
const other = first.team === "A" ? "B" : "A";

check(
  "the wrong team is refused",
  validateAction(POOL, 3, fresh, { team: other, kind: "ban", map: POOL[0] }).ok === false,
);
check(
  "the right team is allowed",
  validateAction(POOL, 3, fresh, { team: first.team, kind: "ban", map: POOL[0] }).ok === true,
);
check(
  "the wrong kind of action is refused",
  validateAction(POOL, 3, fresh, { team: first.team, kind: "pick", map: POOL[0] }).ok === false,
);
check(
  "a map nobody has is refused",
  validateAction(POOL, 3, fresh, { team: first.team, kind: "ban", map: "de_notamap" }).ok === false,
);

const afterOne: VetoAction[] = [{ ordinal: 0, teamId: 1, kind: "ban", map: POOL[0] }];
check(
  "a map already banned cannot be banned again",
  validateAction(POOL, 3, afterOne, { team: "B", kind: "ban", map: POOL[0] }).ok === false,
);

check(
  "nothing is accepted once the veto is over",
  validateAction(POOL, 3, three.actions, { team: "A", kind: "ban", map: POOL[0] }).ok === false,
);

// ---- the timeout -----------------------------------------------------------
//
// A veto that can stall forever stalls a bracket, and a bracket that stalls
// stalls a broadcast.

const auto = autoAction(POOL, 3, []);
check("a timed-out turn has something to do", auto !== null);
check("it picks a map that is actually available", POOL.includes(auto?.map ?? ""), String(auto?.map));
check("a finished veto has nothing left to auto", autoAction(POOL, 3, three.actions) === null);

// The draw is random rather than pool order. It was "first still available",
// which is a fixed answer: the top of the pool was banned in every veto anybody
// timed out of, and on a decider the same map was played every time. A team
// that noticed could plan around it.
check("a low draw takes the first", autoAction(POOL, 3, [], () => 0)?.map === POOL[0]);
check(
  "a high draw takes the last",
  autoAction(POOL, 3, [], () => 0.999)?.map === POOL[POOL.length - 1],
  String(autoAction(POOL, 3, [], () => 0.999)?.map),
);

// A source that returns exactly 1 would index past the end and auto-pick
// undefined, which reads downstream as "no map" rather than as a bad draw.
check("a source at the top of the range still picks a map", autoAction(POOL, 3, [], () => 1)?.map === POOL[POOL.length - 1]);

// Over many draws every map should come up. Seeded rather than Math.random so a
// failure here is reproducible instead of a flake somebody re-runs away.
{
  let seed = 12345;
  const seeded = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const drawn = autoAction(POOL, 3, [], seeded)?.map;
    if (drawn) seen.add(drawn);
  }

  check("every map in the pool can be drawn", seen.size === POOL.length, `${seen.size}/${POOL.length}`);
}

// A side turn must auto to a side, not to a map — autoing a map there would
// desync the sequence from the actions and corrupt everything after it.
const untilSide: VetoAction[] = [];
for (let guard = 0; guard < 20; guard++) {
  const s = vetoState(POOL, 3, untilSide);
  if (!s.next || s.next.kind === "side") break;
  untilSide.push({
    ordinal: untilSide.length,
    teamId: s.next.team === "A" ? 1 : 2,
    kind: s.next.kind,
    map: s.remaining[0],
  });
}
const sideAuto = autoAction(POOL, 3, untilSide);
check("a timed-out side turn autos a side", sideAuto?.kind === "side" && sideAuto.side === "T");

// ---- partial state ---------------------------------------------------------

const halfway = vetoState(POOL, 3, afterOne);
check("a banned map leaves the pool", halfway.remaining.includes(POOL[0]) === false);
check("the rest of the pool remains", halfway.remaining.length === POOL.length - 1);
check("a half-finished veto is not done", halfway.done === false);
check("a half-finished veto shows no decider", halfway.picked.every((p) => !p.isDecider));

console.log(fails === 0 ? "\nall passed" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
