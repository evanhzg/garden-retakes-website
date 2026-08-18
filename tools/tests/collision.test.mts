import { CollisionIndex } from "@/lib/mapCollision";
import type { MapMesh } from "@/lib/utility3d";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

function mesh(positions: number[], indices: number[]): MapMesh {
  const p = new Float32Array(positions);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p[i + a]); max[a] = Math.max(max[a], p[i + a]);
    }
  return { positions: p, indices: new Uint32Array(indices),
    bounds: { min: min as any, max: max as any }, triangles: indices.length / 3 };
}

// A 2000×2000 floor at z=0, two triangles.
const floor = new CollisionIndex(mesh(
  [-1000,-1000,0,  1000,-1000,0,  1000,1000,0,  -1000,1000,0],
  [0,1,2, 0,2,3],
));

check("index sees both triangles", floor.triangles === 2);

const down = floor.raycast([0, 0, 500], [0, 0, -500])!;
check("a ray straight down hits the floor", !!down, "no hit");
check("  at z = 0", near(down.point[2], 0), JSON.stringify(down.point));
check("  halfway along", near(down.t, 0.5), String(down.t));
check("  normal points up at the ray", near(down.normal[2], 1), JSON.stringify(down.normal));

const up = floor.raycast([0, 0, -500], [0, 0, 500])!;
check("hit from underneath too (a hull is not reliably wound)", !!up);
check("  with the normal flipped to face the ray", near(up.normal[2], -1), JSON.stringify(up?.normal));

check("a ray that stops short does not hit", floor.raycast([0, 0, 500], [0, 0, 100]) === null);
check("a ray beside the floor misses", floor.raycast([5000, 5000, 500], [5000, 5000, -500]) === null);
check("a ray parallel to the plane misses", floor.raycast([-500, 0, 10], [500, 0, 10]) === null);
check("a zero-length ray is not a hit", floor.raycast([0, 0, 5], [0, 0, 5]) === null);

// Nearest-hit ordering: two floors, must hit the upper one.
const stacked = new CollisionIndex(mesh(
  [-500,-500,0,  500,-500,0,  500,500,0,  -500,500,0,
   -500,-500,200, 500,-500,200, 500,500,200, -500,500,200],
  [0,1,2, 0,2,3,  4,5,6, 4,6,7],
));
const first = stacked.raycast([0, 0, 500], [0, 0, -500])!;
check("nearest hit wins, not first tested", near(first.point[2], 200), JSON.stringify(first.point));

// The same, but where both surfaces are in one grid cell — the case a
// stop-at-first-triangle bug survives.
const close = new CollisionIndex(mesh(
  [-50,-50,0, 50,-50,0, 50,50,0, -50,50,0,
   -50,-50,10, 50,-50,10, 50,50,10, -50,50,10],
  [0,1,2, 0,2,3,  4,5,6, 4,6,7],
), 96);
const near2 = close.raycast([0, 0, 100], [0, 0, -100])!;
check("nearest wins within one cell", near2 && near(near2.point[2], 10), JSON.stringify(near2?.point));

// A wall, for the reflection tests downstream.
const wall = new CollisionIndex(mesh(
  [500,-500,0, 500,500,0, 500,500,500, 500,-500,500],
  [0,1,2, 0,2,3],
));
const intoWall = wall.raycast([0, 0, 100], [1000, 0, 100])!;
check("a wall is hit", !!intoWall);
check("  at x = 500", near(intoWall.point[0], 500), JSON.stringify(intoWall.point));
check("  normal points back down -x", near(intoWall.normal[0], -1), JSON.stringify(intoWall.normal));

// blocked() must agree with raycast().
check("blocked agrees with raycast", floor.blocked([0,0,500],[0,0,-500]) === true &&
  floor.blocked([5000,5000,500],[5000,5000,-500]) === false);

// A long diagonal across many cells: exercises the DDA walk.
const diag = floor.raycast([-900, -900, 400], [900, 900, -400])!;
check("a long diagonal finds the floor", !!diag && near(diag.point[2], 0), JSON.stringify(diag?.point));

// A ray starting outside the grid entirely.
check("a ray far outside the grid does not crash", floor.raycast([99999, 99999, 99999], [99998, 99998, 99998]) === null);

// Degenerate triangle must never report a hit.
const sliver = new CollisionIndex(mesh([0,0,0, 100,0,0, 200,0,0], [0,1,2]));
check("a zero-area triangle is never hit", sliver.raycast([50, -50, 0], [50, 50, 0]) === null);

// Small cells: many cells per triangle, checks the multi-cell insert.
const fine = new CollisionIndex(mesh(
  [-1000,-1000,0, 1000,-1000,0, 1000,1000,0, -1000,1000,0], [0,1,2, 0,2,3]), 32);
check("a fine grid still finds the floor", near(fine.raycast([0,0,500],[0,0,-500])!.point[2], 0));
check("  and still misses beside it", fine.raycast([5000,5000,500],[5000,5000,-500]) === null);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
