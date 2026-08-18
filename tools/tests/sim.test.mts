import { CollisionIndex } from "@/lib/mapCollision";
import { simulateThrow, throwVelocity, resimulate, endpointError, DEFAULT_CONSTANTS, THROW_POWER } from "@/lib/grenadeSim";
import type { MapMesh } from "@/lib/utility3d";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};
const near = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;

function mesh(positions: number[], indices: number[]): MapMesh {
  const p = new Float32Array(positions);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[i+a]); max[a] = Math.max(max[a], p[i+a]); }
  return { positions: p, indices: new Uint32Array(indices), bounds: { min: min as any, max: max as any }, triangles: indices.length / 3 };
}
const bigFloor = (z = 0) => [-6000,-6000,z, 6000,-6000,z, 6000,6000,z, -6000,6000,z];
const floorOnly = new CollisionIndex(mesh(bigFloor(), [0,1,2, 0,2,3]), 256);

// --- free flight against the closed-form answer ---------------------------
// No geometry in the way: the arc must match projectile motion exactly.
const empty = new CollisionIndex(mesh(bigFloor(-100000), [0,1,2, 0,2,3]), 4096);
const g = DEFAULT_CONSTANTS.gravity * DEFAULT_CONSTANTS.gravityScale;
const flat = simulateThrow([0,0,0], [500,0,0], empty, 1.0);
const endX = flat.end[0], endZ = flat.end[2];
check("horizontal distance is speed × time", near(endX, 500, 5), String(endX));
check("drop matches ½gt²", near(endZ, -0.5 * g * 1, 3), `${endZ} vs ${-0.5*g}`);
check("stopped by the fuse", flat.stopped === "fuse", flat.stopped);
check("the path is sampled, not just endpoints", flat.path.length > 50, String(flat.path.length));
check("time never goes backwards", flat.path.every((p, i, a) => i === 0 || p[3] >= a[i-1][3]));

// --- a bounce off a floor -------------------------------------------------
const drop = simulateThrow([0,0,500], [0,0,0], floorOnly, Infinity);
check("a dropped grenade bounces", drop.bounces.length >= 1, String(drop.bounces.length));
check("  on the floor", near(drop.bounces[0][2], 0, 2), JSON.stringify(drop.bounces[0]));
check("  and comes to rest", drop.stopped === "rest", drop.stopped);
check("  resting on the floor, not through it", drop.end[2] > -1, String(drop.end[2]));

// Restitution: the first rebound must be lower than the drop.
const apexAfter = Math.max(...drop.path.filter(p => p[3] > drop.path.find(q => q[2] < 1)![3]).map(p => p[2]));
check("the rebound is lower than the drop", apexAfter < 500, String(apexAfter));

// --- reflection off a wall ------------------------------------------------
const wall = new CollisionIndex(mesh(
  [500,-2000,-2000, 500,2000,-2000, 500,2000,2000, 500,-2000,2000], [0,1,2, 0,2,3]), 256);
const intoWall = simulateThrow([0,0,0], [1000,0,0], wall, Infinity);
check("a wall reverses the throw", intoWall.end[0] < 500, String(intoWall.end[0]));
check("  after touching it", intoWall.bounces.length >= 1 && near(intoWall.bounces[0][0], 500, 2), JSON.stringify(intoWall.bounces[0]));

// --- throw velocity -------------------------------------------------------
const level = throwVelocity(0, 0, THROW_POWER.full);
check("a level throw is all forward", near(level[0], 750, 0.01) && near(level[2], 0, 0.01), JSON.stringify(level));
const up45 = throwVelocity(-45, 0, THROW_POWER.full);
check("negative pitch aims UP (Source convention)", up45[2] > 0, JSON.stringify(up45));
const east = throwVelocity(0, 90, THROW_POWER.full);
check("yaw 90 points along +y", near(east[1], 750, 0.01), JSON.stringify(east));
const soft = throwVelocity(0, 0, THROW_POWER.soft);
check("a soft throw is slower", soft[0] < level[0] && soft[0] > 0, String(soft[0]));
const running = throwVelocity(0, 0, THROW_POWER.full, [200, 0, 0]);
check("running adds 1.25× your own speed", near(running[0], 750 + 250, 0.01), String(running[0]));

// --- resimulate + error ---------------------------------------------------
// Feed a simulated flight back in as if it were a recording: the physics is
// deterministic, so it must reproduce itself closely.
const truth = simulateThrow([0, 0, 200], [600, 0, 100], floorOnly, 1.5);
const again = resimulate(truth.path, floorOnly, 1.5)!;
const err = endpointError(again, truth.path)!;
check("resimulating a recording lands in the same place", err < 12, `${err.toFixed(1)}u`);
check("endpointError needs a real recording", endpointError(again, []) === null);
check("resimulate refuses a one-point path", resimulate([[0,0,0,0]] as any, floorOnly) === null);
check("resimulate refuses zero elapsed time", resimulate([[0,0,0,5],[1,0,0,5]] as any, floorOnly) === null);

// --- termination guarantees ----------------------------------------------
// A genuinely closed box. The first version of this test had a floor and a
// ceiling and no walls, so the grenade rolled off the edge at x=6000 and fell
// for ever — which is correct behaviour, and the test was wrong rather than
// the simulator.
const boxed = new CollisionIndex(mesh([
  -600,-600,0,  600,-600,0,  600,600,0,  -600,600,0,
  -600,-600,600, 600,-600,600, 600,600,600, -600,600,600,
], [
  0,1,2, 0,2,3,        // floor
  4,5,6, 4,6,7,        // ceiling
  0,1,5, 0,5,4,        // -y wall
  3,2,6, 3,6,7,        // +y wall
  0,3,7, 0,7,4,        // -x wall
  1,2,6, 1,6,5,        // +x wall
]), 256);
const trapped = simulateThrow([0,0,300], [3000,0,0], boxed, Infinity);
check("a grenade in a box always terminates", ["rest","timeout"].includes(trapped.stopped), trapped.stopped);
check("  within the time limit", trapped.path[trapped.path.length-1][3] <= DEFAULT_CONSTANTS.maxSeconds + 0.01);
check("  and never escapes the box", trapped.path.every(p =>
  p[2] > -5 && p[2] < 605 && Math.abs(p[0]) < 605 && Math.abs(p[1]) < 605),
  JSON.stringify(trapped.path.find(p => p[2] < -5 || p[2] > 605 || Math.abs(p[0]) > 605)));

// A very fast throw at a thin wall: the classic tunnelling case.
const fast = simulateThrow([0,0,50], [8000,0,0], wall, Infinity);
check("a fast grenade does not tunnel through a wall", fast.path.every(p => p[0] < 505), String(Math.max(...fast.path.map(p=>p[0]))));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
