import type { CollisionIndex } from "@/lib/mapCollision";

/**
 * Reconstructing a smoke's shape, and a molotov's.
 *
 * This is the part that sounded impossible and is not, and the reason is worth
 * stating plainly: <b>CS2's smoke is a voxel flood fill</b>. The game does not
 * simulate a fluid. When a smoke grenade goes off it fills a grid of cells
 * outward from the detonation point, bounded by a radius and stopped by
 * geometry — which is why a smoke climbs a wall, spills through a doorway and
 * fills a room unevenly rather than being a sphere. Reproducing that is
 * reproducing an algorithm, not reverse-engineering a black box.
 *
 * A molotov is the same idea one dimension down: a spread across the surfaces
 * you can walk on, from the point of impact, bounded by its own radius.
 *
 * Both come out of this file as a set of occupied cells, which the viewer can
 * draw as instanced boxes or run marching cubes over. Neither cares which.
 */

/** Voxel edge, in Source units. */
export const SMOKE_VOXEL = 16;

/**
 * How far a smoke reaches.
 *
 * The plugin already carries this as GardenSettings.SmokeRadius = 144, which is
 * where this number comes from — the two are describing the same thing and
 * should not be allowed to disagree.
 */
export const SMOKE_RADIUS = 144;

/** How far fire spreads from where the molotov broke. */
export const FIRE_RADIUS = 150;

export type VoxelField = {
  /** Cell centres, in world coordinates. */
  cells: [number, number, number][];
  voxel: number;
  /** The corner cell indices span from, so a caller can rebuild the grid. */
  origin: [number, number, number];
};

/**
 * Flood a smoke outward from where it went off.
 *
 * Breadth-first over a voxel grid. Two things decide whether a neighbour is
 * reachable: it has to be within the radius, and the straight line between the
 * two cell centres has to be clear. The second is what makes this look like a
 * smoke rather than a ball — a cell on the far side of a wall is inside the
 * radius and is not reachable, so the smoke stops at the wall and spreads along
 * it instead.
 *
 * Breadth-first specifically, not a distance test: reachability is the whole
 * point. A cell you cannot get to without passing through geometry does not
 * fill, however close it is.
 */
export function floodSmoke(
  centre: readonly [number, number, number],
  world: CollisionIndex,
  radius: number = SMOKE_RADIUS,
  voxel: number = SMOKE_VOXEL,
): VoxelField {
  const span = Math.ceil(radius / voxel);
  const size = span * 2 + 1;
  const origin: [number, number, number] = [
    centre[0] - span * voxel,
    centre[1] - span * voxel,
    centre[2] - span * voxel,
  ];

  const at = (x: number, y: number, z: number) => (z * size + y) * size + x;
  const filled = new Uint8Array(size * size * size);
  const cells: [number, number, number][] = [];

  const world0 = (i: number, axis: number) => origin[axis] + i * voxel + voxel / 2;

  // The queue holds grid coordinates. Starting from the centre cell, which is
  // where the grenade is — if that is inside geometry the smoke has gone off
  // inside a wall and the result is correctly empty.
  const queue: [number, number, number][] = [[span, span, span]];
  filled[at(span, span, span)] = 1;
  cells.push([world0(span, 0), world0(span, 1), world0(span, 2)]);

  // Six-connected, not twenty-six. A diagonal step can slip through the seam
  // between two walls that meet at a corner, which is exactly the leak that
  // makes a reconstruction untrustworthy: smoke appearing on the wrong side of
  // a corner is worse than smoke that is slightly too square.
  const steps: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];

  const radiusSquared = radius * radius;

  while (queue.length > 0) {
    const [cx, cy, cz] = queue.pop()!;
    const from: [number, number, number] = [world0(cx, 0), world0(cy, 1), world0(cz, 2)];

    for (const [dx, dy, dz] of steps) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= size || ny >= size || nz >= size) continue;

      const index = at(nx, ny, nz);
      if (filled[index]) continue;

      const to: [number, number, number] = [world0(nx, 0), world0(ny, 1), world0(nz, 2)];
      const dxr = to[0] - centre[0];
      const dyr = to[1] - centre[1];
      const dzr = to[2] - centre[2];
      if (dxr * dxr + dyr * dyr + dzr * dzr > radiusSquared) continue;

      // Marked before the geometry test, not after. A blocked cell that stays
      // unmarked is retested from every one of its other neighbours, which for
      // a smoke against a wall is most of the raycasts done.
      filled[index] = 1;
      if (world.blocked(from, to)) continue;

      cells.push(to);
      queue.push([nx, ny, nz]);
    }
  }

  return { cells, voxel, origin };
}

/**
 * Spread fire across the surfaces around where a molotov broke.
 *
 * The same flood, restricted to cells that are sitting on something walkable.
 * "Walkable" is a floor test: a downward ray from the cell finds geometry
 * within about a step, and the surface it finds is not a wall.
 *
 * This is why fire pools at the bottom of a ramp and does not climb the wall
 * beside it, and why one thrown at a doorway burns the doorway rather than a
 * sphere of the room.
 */
export function floodFire(
  impact: readonly [number, number, number],
  world: CollisionIndex,
  radius: number = FIRE_RADIUS,
  voxel: number = SMOKE_VOXEL,
): VoxelField {
  const span = Math.ceil(radius / voxel);
  const size = span * 2 + 1;
  // A shallow slab rather than a cube: fire is a surface, and searching a
  // sphere's worth of empty air above it is work with no result in it.
  const height = 3;
  const origin: [number, number, number] = [
    impact[0] - span * voxel,
    impact[1] - span * voxel,
    impact[2] - voxel,
  ];

  const at = (x: number, y: number, z: number) => (z * size + y) * size + x;
  const seen = new Uint8Array(size * size * height);
  const cells: [number, number, number][] = [];

  const worldX = (i: number) => origin[0] + i * voxel + voxel / 2;
  const worldY = (i: number) => origin[1] + i * voxel + voxel / 2;
  const worldZ = (i: number) => origin[2] + i * voxel + voxel / 2;

  /** The ground under a cell, if there is any within a step. */
  const groundUnder = (x: number, y: number, z: number): [number, number, number] | null => {
    const from: [number, number, number] = [worldX(x), worldY(y), worldZ(z) + voxel];
    const to: [number, number, number] = [from[0], from[1], from[2] - voxel * 2.5];
    const hit = world.raycast(from, to);
    if (!hit) return null;

    // A near-vertical normal is a floor; anything else is a wall the ray
    // happened to clip, and fire does not sit on a wall.
    if (hit.normal[2] < 0.5) return null;

    return [hit.point[0], hit.point[1], hit.point[2] + 2];
  };

  const start: [number, number, number] = [span, span, 1];
  const startGround = groundUnder(...start);
  if (!startGround) {
    // Nothing under the impact point to burn — it went off in mid-air, which is
    // a legitimate answer rather than a failure.
    return { cells, voxel, origin };
  }

  const queue: [number, number, number][] = [start];
  seen[at(span, span, 1)] = 1;
  cells.push(startGround);

  const steps: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
    // Up and down a step, so fire climbs a staircase and pours off a ledge
    // rather than stopping dead at the first change in height.
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 0, -1], [-1, 0, -1], [0, 1, -1], [0, -1, -1],
  ];

  const radiusSquared = radius * radius;

  while (queue.length > 0) {
    const [cx, cy, cz] = queue.pop()!;
    const here = groundUnder(cx, cy, cz);
    if (!here) continue;

    for (const [dx, dy, dz] of steps) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= size || ny >= size || nz >= height) continue;

      const index = at(nx, ny, nz);
      if (seen[index]) continue;
      seen[index] = 1;

      const dxr = worldX(nx) - impact[0];
      const dyr = worldY(ny) - impact[1];
      // Radius measured on the ground plane. Fire spreading uphill covers less
      // ground than fire on the flat, which is what it does in game.
      if (dxr * dxr + dyr * dyr > radiusSquared) continue;

      const ground = groundUnder(nx, ny, nz);
      if (!ground) continue;

      // The step between the two patches has to be clear, or fire crosses a
      // wall that happens to have floor on both sides of it.
      if (world.blocked([here[0], here[1], here[2] + 4], [ground[0], ground[1], ground[2] + 4])) {
        continue;
      }

      cells.push(ground);
      queue.push([nx, ny, nz]);
    }
  }

  return { cells, voxel, origin };
}
