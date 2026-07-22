// Board layout math, parameterized by tiles-per-side so it works for any square
// board (classic = 9/side = 40 tiles). Maps a tile index to a 3D transform on
// the square track, plus the direction helpers used to place pawns / houses and
// animate a pawn hopping between tiles.
//
// World frame: +X = right (east), +Z = toward the viewer (south), +Y = up.
// GO (index 0) sits at the near-right corner; travel goes anticlockwise as the
// index rises (bottom row right→left, up the left side, top row left→right,
// down the right).

import { CORNER, TILE_W, TILE_D } from "./theme";

export type Edge = "bottom" | "left" | "top" | "right" | "corner";

// Geometry derived from tiles-per-side. Corner tiles are square; `perSide` edge
// tiles sit between each pair of corners.
export function boardGeometry(perSide: number) {
  const sideLen = 2 * CORNER + perSide * TILE_W;
  const half = sideLen / 2;
  return {
    perSide,
    total: perSide * 4 + 4,
    sideLen,
    half,
    fieldHalf: half - TILE_D,
    edgeC: half - TILE_D / 2, // edge-tile centre distance from board centre
    cornC: half - CORNER / 2, // corner-tile centre distance
    inner: half - CORNER,     // inner edge of a corner (along-edge origin)
  };
}

const cornerIndices = (perSide: number) => [0, perSide + 1, 2 * (perSide + 1), 3 * (perSide + 1)];

// Which side of the board a tile lives on, plus its 0-based index within that
// side's run (for edge tiles).
export function tileSide(index: number, perSide: number): { edge: Edge; k: number } {
  const c1 = perSide + 1, c2 = 2 * (perSide + 1), c3 = 3 * (perSide + 1);
  if (index === 0 || index === c1 || index === c2 || index === c3) return { edge: "corner", k: 0 };
  if (index < c1) return { edge: "bottom", k: index - 1 };
  if (index < c2) return { edge: "left", k: index - (c1 + 1) };
  if (index < c3) return { edge: "top", k: index - (c2 + 1) };
  return { edge: "right", k: index - (c3 + 1) };
}

export type TileTransform = {
  position: [number, number, number];
  yaw: number;
  edge: Edge;
  size: [number, number];
};

const EDGE_YAW: Record<Exclude<Edge, "corner">, number> = {
  bottom: 0,
  left: -Math.PI / 2,
  top: Math.PI,
  right: Math.PI / 2,
};

export function tileTransform(index: number, perSide: number): TileTransform {
  const g = boardGeometry(perSide);
  const { edge, k } = tileSide(index, perSide);

  if (edge === "corner") {
    const [c0, c1, c2, c3] = cornerIndices(perSide);
    const map: Record<number, [number, number]> = {
      [c0]: [g.cornC, g.cornC],    // near-right (GO)
      [c1]: [-g.cornC, g.cornC],   // near-left  (Jail)
      [c2]: [-g.cornC, -g.cornC],  // far-left   (Free Parking)
      [c3]: [g.cornC, -g.cornC],   // far-right  (Go To Jail)
    };
    const [x, z] = map[index];
    return { position: [x, 0, z], yaw: 0, edge: "corner", size: [CORNER, CORNER] };
  }

  let x = 0, z = 0;
  if (edge === "bottom") { x = g.inner - (k + 0.5) * TILE_W; z = g.edgeC; }
  if (edge === "left")   { x = -g.edgeC; z = g.inner - (k + 0.5) * TILE_W; }
  if (edge === "top")    { x = -g.inner + (k + 0.5) * TILE_W; z = -g.edgeC; }
  if (edge === "right")  { x = g.edgeC; z = -g.inner + (k + 0.5) * TILE_W; }

  return { position: [x, 0, z], yaw: EDGE_YAW[edge], edge, size: [TILE_W, TILE_D] };
}

// Unit world directions for a tile: `inward` points to the board centre (where
// the colour bar / houses go), `along` runs parallel to the edge.
export function tileDirs(index: number, perSide: number): { inward: [number, number]; along: [number, number] } {
  switch (tileSide(index, perSide).edge) {
    case "bottom": return { inward: [0, -1], along: [1, 0] };
    case "left":   return { inward: [1, 0], along: [0, 1] };
    case "top":    return { inward: [0, 1], along: [1, 0] };
    case "right":  return { inward: [-1, 0], along: [0, 1] };
    default:       return { inward: [0, 0], along: [1, 0] };
  }
}

export function tileCenter(index: number, perSide: number): [number, number] {
  const t = tileTransform(index, perSide);
  return [t.position[0], t.position[2]];
}

// A small stable per-slot offset so several pawns sharing a tile don't overlap.
export function pawnSlotOffset(index: number, i: number, perSide: number): [number, number] {
  const { inward, along } = tileDirs(index, perSide);
  const col = i % 2;
  const row = Math.floor(i / 2);
  const a = (col - 0.5) * 0.34;
  const b = 0.12 + row * 0.34;
  return [along[0] * a + inward[0] * b, along[1] * a + inward[1] * b];
}

// Ordered list of tile indices a pawn passes through moving from `from` to `to`
// on a board of `total` tiles. Short forward moves step tile-by-tile (board-game
// hop); long jumps (teleport cards) return just the endpoints so it arcs there.
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
