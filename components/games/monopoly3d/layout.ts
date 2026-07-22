// Board layout math. A board is an ordered ring of N tiles with exactly 4
// corners (the role indices). buildLayout lays it into a rectangle — sides may
// have different tile counts (uneven / non-square boards); a side with fewer
// tiles simply gets wider tiles. Square boards are the equal-sides special case,
// so the classic 40-tile board is unchanged.
//
// World frame: +X = right, +Z = toward the viewer, +Y = up. The first corner
// (GO) is the near-right corner; travel goes anticlockwise as the index rises.

import { CORNER, TILE_W, TILE_D } from "./theme";

export type Edge = "bottom" | "left" | "top" | "right" | "corner";

export type TileXform = {
  position: [number, number, number];
  yaw: number;
  size: [number, number]; // [alongPerimeter, towardCentre]
  edge: Edge;
};

export type Layout = {
  total: number;
  halfW: number;
  halfH: number;
  fieldHalfW: number;
  fieldHalfH: number;
  half: number;         // max(halfW, halfH) — for camera/shadow framing
  cornerIds: number[];  // 4 corner indices, sorted (ring order)
  tiles: TileXform[];   // indexed by slot id 0..total-1
  center: (id: number) => [number, number];
  dirs: (id: number) => { inward: [number, number]; along: [number, number] };
  nearestNonCorner: (x: number, z: number) => number;
};

const EDGE_YAW: Record<Exclude<Edge, "corner">, number> = {
  bottom: 0, left: -Math.PI / 2, top: Math.PI, right: Math.PI / 2,
};

const DIRS: Record<Edge, { inward: [number, number]; along: [number, number] }> = {
  bottom: { inward: [0, -1], along: [1, 0] },
  left: { inward: [1, 0], along: [0, 1] },
  top: { inward: [0, 1], along: [1, 0] },
  right: { inward: [-1, 0], along: [0, 1] },
  corner: { inward: [0, 0], along: [1, 0] },
};

export function buildLayout(roles: any, total: number): Layout {
  const corners = [roles.go, roles.jail, roles.goToJail, roles.freeParking]
    .filter((n: any) => Number.isInteger(n))
    .sort((a: number, b: number) => a - b);
  const [c0, c1, c2, c3] = corners;
  const cornerSet = new Set(corners);

  const nb = Math.max(0, c1 - c0 - 1);
  const nl = Math.max(0, c2 - c1 - 1);
  const nt = Math.max(0, c3 - c2 - 1);
  const nr = Math.max(0, (total - c3 - 1) + c0); // tiles after c3 + tiles before c0

  const innerW = Math.max(nb, nt, 1) * TILE_W;
  const innerH = Math.max(nl, nr, 1) * TILE_W;
  const halfW = innerW / 2 + CORNER;
  const halfH = innerH / 2 + CORNER;

  const edgeOf = (id: number): Edge => {
    if (cornerSet.has(id)) return "corner";
    if (id > c0 && id < c1) return "bottom";
    if (id > c1 && id < c2) return "left";
    if (id > c2 && id < c3) return "top";
    return "right";
  };

  const tiles: TileXform[] = new Array(total);
  const cornerPos: Record<number, [number, number]> = {
    [c0]: [halfW - CORNER / 2, halfH - CORNER / 2],   // near-right (GO)
    [c1]: [-(halfW - CORNER / 2), halfH - CORNER / 2], // near-left
    [c2]: [-(halfW - CORNER / 2), -(halfH - CORNER / 2)], // far-left
    [c3]: [halfW - CORNER / 2, -(halfH - CORNER / 2)],  // far-right
  };

  for (let id = 0; id < total; id++) {
    const edge = edgeOf(id);
    if (edge === "corner") {
      const [x, z] = cornerPos[id];
      tiles[id] = { position: [x, 0, z], yaw: 0, size: [CORNER, CORNER], edge };
      continue;
    }
    let x = 0, z = 0, w = TILE_W;
    if (edge === "bottom") {
      const k = id - c0 - 1; w = innerW / nb;
      x = (halfW - CORNER) - (k + 0.5) * w; z = halfH - TILE_D / 2;
    } else if (edge === "left") {
      const k = id - c1 - 1; w = innerH / nl;
      x = -(halfW - TILE_D / 2); z = (halfH - CORNER) - (k + 0.5) * w;
    } else if (edge === "top") {
      const k = id - c2 - 1; w = innerW / nt;
      x = -(halfW - CORNER) + (k + 0.5) * w; z = -(halfH - TILE_D / 2);
    } else { // right — indices c3+1..total-1 (GO is at 0, so no wrap in practice)
      const k = id - c3 - 1; w = innerH / nr;
      x = halfW - TILE_D / 2; z = -(halfH - CORNER) + (k + 0.5) * w;
    }
    tiles[id] = { position: [x, 0, z], yaw: EDGE_YAW[edge], size: [w, TILE_D], edge };
  }

  const center = (id: number): [number, number] => {
    const t = tiles[id] || tiles[0];
    return [t.position[0], t.position[2]];
  };
  const dirs = (id: number) => DIRS[edgeOf(id)];
  const nearestNonCorner = (x: number, z: number): number => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < total; i++) {
      if (cornerSet.has(i)) continue;
      const [cx, cz] = center(i);
      const dd = (cx - x) * (cx - x) + (cz - z) * (cz - z);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    return best;
  };

  return {
    total, halfW, halfH,
    fieldHalfW: halfW - TILE_D, fieldHalfH: halfH - TILE_D,
    half: Math.max(halfW, halfH),
    cornerIds: corners, tiles, center, dirs, nearestNonCorner,
  };
}

// A small stable per-slot offset so several pawns sharing a tile don't overlap.
export function slotOffset(dirs: { inward: [number, number]; along: [number, number] }, i: number): [number, number] {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const a = (col - 0.5) * 0.34;
  const b = 0.12 + row * 0.34;
  return [dirs.along[0] * a + dirs.inward[0] * b, dirs.along[1] * a + dirs.inward[1] * b];
}

// Ordered tile ids a pawn passes through moving from `from` to `to` on N tiles.
export function pathBetween(from: number, to: number, total: number): number[] {
  const forward = (to - from + total) % total;
  if (forward === 0) return [from];
  if (forward <= 12) {
    const out: number[] = [];
    for (let s = 0; s <= forward; s++) out.push((from + s) % total);
    return out;
  }
  return [from, to];
}
