import type { MapMesh } from "@/lib/utility3d";

/**
 * Segment queries against a map's collision hull.
 *
 * Everything in phase two rests on one question — "does the straight line from
 * here to there hit anything, and if so where and facing which way" — so that
 * question gets its own file and its own tests. A grenade bounce is that
 * question. A smoke voxel being able to reach its neighbour is that question. A
 * fire spreading across a floor is that question.
 *
 * <b>Why a uniform grid rather than a BVH.</b> A BVH is better at wildly uneven
 * geometry; a CS2 collision hull is not that. It is a few tens of thousands of
 * triangles spread fairly evenly through a box a few thousand units on a side,
 * which is the case a uniform grid handles well — and a grid walked with a 3D
 * DDA visits cells in order along the ray, so the first hit found is the
 * nearest hit and the walk stops there. It also costs no dependency, which
 * matters for something this load-bearing: a wrong answer here is a grenade
 * that goes through a wall, and it should be our code that is wrong.
 */

export type Hit = {
  /** Fraction along the segment, 0 at the start and 1 at the end. */
  t: number;
  point: [number, number, number];
  /** Unit surface normal, always facing back towards where the ray came from. */
  normal: [number, number, number];
};

/** Cell size in Source units. A player is 32 wide; this is a couple of steps. */
const DEFAULT_CELL = 96;

export class CollisionIndex {
  private readonly positions: Float32Array;
  private readonly indices: Uint32Array;
  private readonly min: [number, number, number];
  private readonly cell: number;
  private readonly dims: [number, number, number];
  /** Triangle ids per cell, as one flat array plus per-cell offsets. */
  private readonly cellStart: Uint32Array;
  private readonly cellTris: Uint32Array;

  readonly triangles: number;

  constructor(mesh: MapMesh, cell = DEFAULT_CELL) {
    this.positions = mesh.positions;
    this.indices = mesh.indices;
    this.triangles = mesh.indices.length / 3;
    this.cell = cell;

    // A hair of padding, so a triangle lying exactly on the boundary of the
    // last cell still has a cell to live in.
    this.min = [mesh.bounds.min[0] - 1, mesh.bounds.min[1] - 1, mesh.bounds.min[2] - 1];
    const max = [mesh.bounds.max[0] + 1, mesh.bounds.max[1] + 1, mesh.bounds.max[2] + 1];
    this.dims = [
      Math.max(1, Math.ceil((max[0] - this.min[0]) / cell)),
      Math.max(1, Math.ceil((max[1] - this.min[1]) / cell)),
      Math.max(1, Math.ceil((max[2] - this.min[2]) / cell)),
    ];

    // Two passes: count per cell, then fill. One pass into arrays-of-arrays
    // would allocate one array per cell, which for a map-sized grid is tens of
    // thousands of tiny allocations and the slowest part of loading a map.
    const cells = this.dims[0] * this.dims[1] * this.dims[2];
    const counts = new Uint32Array(cells + 1);

    this.forEachTriangleCell((_, cellIndex) => {
      counts[cellIndex + 1]++;
    });
    for (let i = 1; i <= cells; i++) counts[i] += counts[i - 1];

    this.cellStart = counts;
    this.cellTris = new Uint32Array(counts[cells]);
    const cursor = counts.slice(0, cells);
    this.forEachTriangleCell((tri, cellIndex) => {
      this.cellTris[cursor[cellIndex]++] = tri;
    });
  }

  /** Visit every (triangle, cell) pair, for both index-building passes. */
  private forEachTriangleCell(visit: (tri: number, cellIndex: number) => void): void {
    for (let tri = 0; tri < this.triangles; tri++) {
      const a = this.indices[tri * 3] * 3;
      const b = this.indices[tri * 3 + 1] * 3;
      const c = this.indices[tri * 3 + 2] * 3;

      // The triangle's own box, clamped to the grid. A big triangle — a floor
      // slab — lands in many cells, which is correct: it really is in them.
      const lo = [0, 0, 0];
      const hi = [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) {
        const p = this.positions;
        const smallest = Math.min(p[a + axis], p[b + axis], p[c + axis]);
        const largest = Math.max(p[a + axis], p[b + axis], p[c + axis]);
        lo[axis] = this.clampCell(Math.floor((smallest - this.min[axis]) / this.cell), axis);
        hi[axis] = this.clampCell(Math.floor((largest - this.min[axis]) / this.cell), axis);
      }

      for (let z = lo[2]; z <= hi[2]; z++) {
        for (let y = lo[1]; y <= hi[1]; y++) {
          for (let x = lo[0]; x <= hi[0]; x++) {
            visit(tri, this.cellIndex(x, y, z));
          }
        }
      }
    }
  }

  private clampCell(v: number, axis: number): number {
    return Math.min(Math.max(v, 0), this.dims[axis] - 1);
  }

  private cellIndex(x: number, y: number, z: number): number {
    return (z * this.dims[1] + y) * this.dims[0] + x;
  }

  /**
   * The nearest hit between two points, or null.
   *
   * Walks the grid cell by cell along the segment and stops at the first cell
   * that produced a hit — but only after finishing that cell, since a cell can
   * hold several triangles and the first one tested is not necessarily the
   * nearest. Getting that wrong gives a bounce off the far wall of a doorway.
   */
  raycast(from: readonly [number, number, number], to: readonly [number, number, number]): Hit | null {
    const dir: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(dir[0], dir[1], dir[2]);
    if (length === 0) return null;

    let cx = this.clampCell(Math.floor((from[0] - this.min[0]) / this.cell), 0);
    let cy = this.clampCell(Math.floor((from[1] - this.min[1]) / this.cell), 1);
    let cz = this.clampCell(Math.floor((from[2] - this.min[2]) / this.cell), 2);

    const step = [Math.sign(dir[0]), Math.sign(dir[1]), Math.sign(dir[2])];
    const tDelta = [0, 0, 0];
    const tMax = [Infinity, Infinity, Infinity];
    const cursor = [cx, cy, cz];

    for (let axis = 0; axis < 3; axis++) {
      if (step[axis] === 0) continue;
      tDelta[axis] = Math.abs(this.cell / dir[axis]);
      const boundary =
        this.min[axis] + (cursor[axis] + (step[axis] > 0 ? 1 : 0)) * this.cell;
      tMax[axis] = (boundary - from[axis]) / dir[axis];
    }

    // Bounded so a ray that somehow fails to leave the grid cannot spin. The
    // longest honest walk is the grid's diagonal in cells.
    const limit = this.dims[0] + this.dims[1] + this.dims[2] + 3;
    for (let steps = 0; steps < limit; steps++) {
      const hit = this.testCell(this.cellIndex(cx, cy, cz), from, dir);
      if (hit) return hit;

      // Advance along whichever axis crosses a boundary first.
      const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      if (tMax[axis] > 1 || step[axis] === 0) break;

      if (axis === 0) cx += step[0];
      else if (axis === 1) cy += step[1];
      else cz += step[2];

      if (cx < 0 || cy < 0 || cz < 0 || cx >= this.dims[0] || cy >= this.dims[1] || cz >= this.dims[2]) {
        break;
      }
      tMax[axis] += tDelta[axis];
    }

    return null;
  }

  /** Whether anything at all is in the way. Cheaper to say than where. */
  blocked(from: readonly [number, number, number], to: readonly [number, number, number]): boolean {
    return this.raycast(from, to) !== null;
  }

  private testCell(
    cellIndex: number,
    from: readonly [number, number, number],
    dir: readonly [number, number, number],
  ): Hit | null {
    let best: Hit | null = null;

    for (let i = this.cellStart[cellIndex]; i < this.cellStart[cellIndex + 1]; i++) {
      const hit = this.testTriangle(this.cellTris[i], from, dir);
      // Nearest within the cell, not first found: a cell holds several
      // triangles and testing order is arbitrary.
      if (hit && (!best || hit.t < best.t)) best = hit;
    }

    return best;
  }

  /**
   * Möller–Trumbore, without the back-face cull.
   *
   * A collision hull is not reliably wound — it is a soup, and a grenade
   * bouncing off the back of a triangle is still a grenade hitting a wall. The
   * normal is flipped towards the ray instead, so a bounce off either side
   * reflects the way it should.
   */
  private testTriangle(
    tri: number,
    from: readonly [number, number, number],
    dir: readonly [number, number, number],
  ): Hit | null {
    const p = this.positions;
    const ia = this.indices[tri * 3] * 3;
    const ib = this.indices[tri * 3 + 1] * 3;
    const ic = this.indices[tri * 3 + 2] * 3;

    const e1x = p[ib] - p[ia], e1y = p[ib + 1] - p[ia + 1], e1z = p[ib + 2] - p[ia + 2];
    const e2x = p[ic] - p[ia], e2y = p[ic + 1] - p[ia + 1], e2z = p[ic + 2] - p[ia + 2];

    const hx = dir[1] * e2z - dir[2] * e2y;
    const hy = dir[2] * e2x - dir[0] * e2z;
    const hz = dir[0] * e2y - dir[1] * e2x;

    const det = e1x * hx + e1y * hy + e1z * hz;
    // Parallel to the triangle's plane: no crossing, however close it passes.
    if (Math.abs(det) < 1e-9) return null;

    const inv = 1 / det;
    const sx = from[0] - p[ia], sy = from[1] - p[ia + 1], sz = from[2] - p[ia + 2];

    const u = (sx * hx + sy * hy + sz * hz) * inv;
    if (u < 0 || u > 1) return null;

    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;

    const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
    if (v < 0 || u + v > 1) return null;

    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    // Excludes t = 0 by a hair: a bounce leaves the projectile sitting on the
    // surface it just hit, and t = 0 would find that surface again forever.
    if (t <= 1e-6 || t > 1) return null;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nlen = Math.hypot(nx, ny, nz) || 1;
    nx /= nlen; ny /= nlen; nz /= nlen;

    if (nx * dir[0] + ny * dir[1] + nz * dir[2] > 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }

    return {
      t,
      point: [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t],
      normal: [nx, ny, nz],
    };
  }
}
