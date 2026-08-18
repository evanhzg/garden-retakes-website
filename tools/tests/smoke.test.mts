import { CollisionIndex } from "@/lib/mapCollision";
import { floodSmoke, floodFire, SMOKE_RADIUS, SMOKE_VOXEL } from "@/lib/smokeSim";
import type { MapMesh } from "@/lib/utility3d";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

function mesh(positions: number[], indices: number[]): MapMesh {
  const p = new Float32Array(positions);
  let min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) { min[a]=Math.min(min[a],p[i+a]); max[a]=Math.max(max[a],p[i+a]); }
  return { positions: p, indices: new Uint32Array(indices), bounds: { min: min as any, max: max as any }, triangles: indices.length/3 };
}
const quad = (v: number[][]) => v.flat();

// Nothing in the way at all: an unobstructed smoke should be a ball.
const nothing = new CollisionIndex(mesh([-9000,-9000,-9000, -8000,-9000,-9000, -8000,-8000,-9000], [0,1,2]), 512);
const free = floodSmoke([0,0,0], nothing);
check("an unobstructed smoke fills its radius", free.cells.length > 500, String(free.cells.length));
check("  and nothing outside it", free.cells.every(c => Math.hypot(c[0],c[1],c[2]) <= SMOKE_RADIUS + 1),
  String(Math.max(...free.cells.map(c => Math.hypot(c[0],c[1],c[2])))));
check("  roughly spherical", (() => {
  // Volume of the filled set vs the sphere it should approximate.
  const v = free.cells.length * SMOKE_VOXEL ** 3;
  const sphere = (4 / 3) * Math.PI * SMOKE_RADIUS ** 3;
  return v > sphere * 0.75 && v < sphere * 1.25;
})(), String(free.cells.length * SMOKE_VOXEL ** 3 / ((4/3)*Math.PI*SMOKE_RADIUS**3)));

// A wall through the middle: nothing may appear on the far side.
const wall = new CollisionIndex(mesh(quad([
  [50,-400,-400],[50,400,-400],[50,400,400],[50,-400,400]]), [0,1,2, 0,2,3]), 64);
const blocked = floodSmoke([0,0,0], wall);
check("a wall stops the smoke", blocked.cells.every(c => c[0] < 55), String(Math.max(...blocked.cells.map(c=>c[0]))));
check("  and it still fills the near side", blocked.cells.length > 200, String(blocked.cells.length));

// A wall with a hole: smoke must get through and spread on the far side —
// the behaviour a plain distance test can never produce.
const holed = new CollisionIndex(mesh([
  // wall from y=-400..-40 and y=40..400, leaving a gap
  50,-400,-400, 50,-40,-400, 50,-40,400, 50,-400,400,
  50,40,-400, 50,400,-400, 50,400,400, 50,40,400,
], [0,1,2, 0,2,3, 4,5,6, 4,6,7]), 64);
const through = floodSmoke([0,0,0], holed);
const farSide = through.cells.filter(c => c[0] > 55);
check("smoke pours through a gap", farSide.length > 0, String(farSide.length));
// The far side does keep spreading sideways once it is through, which is what
// a smoke through a doorway does — so the meaningful test is not how wide it
// gets but that it got there *through the gap*: a solid wall in the same place
// must let nothing past at all.
const solidFar = blocked.cells.filter(c => c[0] > 55);
check("  which a solid wall in the same place does not", solidFar.length === 0, String(solidFar.length));
check("  and the far side is smaller than the near", farSide.length < through.cells.length - farSide.length,
  `${farSide.length} far vs ${through.cells.length - farSide.length} near`);
check("  still bounded by the radius", farSide.every(c => Math.hypot(c[0],c[1],c[2]) <= 144 + 1),
  String(Math.max(...farSide.map(c => Math.hypot(c[0],c[1],c[2])))));

// Sealed in a box: the smoke is confined to it.
const boxHalf = 48;
const sealed = new CollisionIndex(mesh([
  -boxHalf,-boxHalf,-boxHalf, boxHalf,-boxHalf,-boxHalf, boxHalf,boxHalf,-boxHalf, -boxHalf,boxHalf,-boxHalf,
  -boxHalf,-boxHalf,boxHalf, boxHalf,-boxHalf,boxHalf, boxHalf,boxHalf,boxHalf, -boxHalf,boxHalf,boxHalf,
], [0,1,2,0,2,3, 4,5,6,4,6,7, 0,1,5,0,5,4, 3,2,6,3,6,7, 0,3,7,0,7,4, 1,2,6,1,6,5]), 32);
const inBox = floodSmoke([0,0,0], sealed);
check("a smoke in a sealed box stays in it",
  inBox.cells.every(c => Math.abs(c[0]) < boxHalf + SMOKE_VOXEL && Math.abs(c[1]) < boxHalf + SMOKE_VOXEL && Math.abs(c[2]) < boxHalf + SMOKE_VOXEL),
  JSON.stringify(inBox.cells.find(c => Math.abs(c[0]) >= boxHalf + SMOKE_VOXEL)));
check("  and is much smaller than a free one", inBox.cells.length < free.cells.length / 4,
  `${inBox.cells.length} vs ${free.cells.length}`);

// --- fire -----------------------------------------------------------------
const ground = new CollisionIndex(mesh([-2000,-2000,0, 2000,-2000,0, 2000,2000,0, -2000,2000,0], [0,1,2, 0,2,3]), 128);
const fire = floodFire([0,0,4], ground);
check("fire spreads across a floor", fire.cells.length > 50, String(fire.cells.length));
check("  hugging the ground", fire.cells.every(c => c[2] > -1 && c[2] < 30), String(Math.max(...fire.cells.map(c=>c[2]))));
check("  within its radius", fire.cells.every(c => Math.hypot(c[0],c[1]) <= 150 + SMOKE_VOXEL * 2),
  String(Math.max(...fire.cells.map(c=>Math.hypot(c[0],c[1])))));
check("  and it is a disc, not a ball", (() => {
  const zs = fire.cells.map(c => c[2]);
  return Math.max(...zs) - Math.min(...zs) < 40;
})());

// Fire in mid-air with nothing under it burns nothing.
const midair = floodFire([0,0,900], ground);
check("fire with no floor under it burns nothing", midair.cells.length === 0, String(midair.cells.length));

// A wall across the floor stops the spread.
const walled = new CollisionIndex(mesh([
  -2000,-2000,0, 2000,-2000,0, 2000,2000,0, -2000,2000,0,
  60,-500,0, 60,500,0, 60,500,200, 60,-500,200,
], [0,1,2, 0,2,3, 4,5,6, 4,6,7]), 64);
const stopped = floodFire([0,0,4], walled);
check("fire does not cross a wall", stopped.cells.every(c => c[0] < 70), String(Math.max(...stopped.cells.map(c=>c[0]))));
check("  but still burns the near side", stopped.cells.length > 20, String(stopped.cells.length));

// Termination on pathological input.
const t0 = Date.now();
floodSmoke([0,0,0], nothing, 400, 16);
check("a large radius still finishes quickly", Date.now() - t0 < 4000, `${Date.now()-t0}ms`);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
