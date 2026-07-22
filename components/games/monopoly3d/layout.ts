// Board layout math: maps a classic-board tile id (0–39) to a 3D transform on
// the square track, plus the direction helpers used to place pawns / houses and
// to animate a pawn hopping from tile to tile.
//
// World frame: +X = right (east), +Z = toward the viewer (south), +Y = up.
// GO (0) sits at the near-right corner; travel goes anticlockwise as ids rise
// (bottom row right→left, up the left side, top row left→right, down the right).

import { HALF, CORNER, TILE_W, TILE_D } from "./theme";

export type Edge = "bottom" | "left" | "top" | "right" | "corner";

// Which side of the board a tile lives on.
export function tileSide(id: number): Edge {
  if (id === 0 || id === 10 || id === 20 || id === 30) return "corner";
  if (id >= 1 && id <= 9) return "bottom";  // +Z side
  if (id >= 11 && id <= 19) return "left";  // -X side
  if (id >= 21 && id <= 29) return "top";   // -Z side
  return "right";                            // +X side (31–39)
}

// Distance from board centre to an edge-tile centre (or corner centre).
const EDGE_C = HALF - TILE_D / 2;   // edge tiles
const CORN_C = HALF - CORNER / 2;   // corner tiles
// Along-edge origin: inner edge of the start corner.
const INNER = HALF - CORNER;

export type TileTransform = {
  position: [number, number, number]; // world XZ (Y=0 at plinth top plane)
  yaw: number;                        // rotation about Y so the face reads outward
  edge: Edge;
  size: [number, number];            // [alongPerimeter, towardCentre]
};

// Yaw that orients a tile's inward face (texture top) toward the board centre.
const EDGE_YAW: Record<Exclude<Edge, "corner">, number> = {
  bottom: 0,
  left: -Math.PI / 2,
  top: Math.PI,
  right: Math.PI / 2,
};

export function tileTransform(id: number): TileTransform {
  const side = tileSide(id);
  if (side === "corner") {
    const map: Record<number, [number, number]> = {
      0: [CORN_C, CORN_C],   // near-right
      10: [-CORN_C, CORN_C], // near-left
      20: [-CORN_C, -CORN_C],// far-left
      30: [CORN_C, -CORN_C], // far-right
    };
    const [x, z] = map[id];
    // Corner tiles stay axis-aligned (square); their faces are drawn upright.
    return { position: [x, 0, z], yaw: 0, edge: "corner", size: [CORNER, CORNER] };
  }

  // k = 0..8 index along the side in travel direction.
  let x = 0, z = 0, k = 0;
  if (side === "bottom") { k = id - 1;  x = INNER - (k + 0.5) * TILE_W; z = EDGE_C; }
  if (side === "left")   { k = id - 11; x = -EDGE_C; z = INNER - (k + 0.5) * TILE_W; }
  if (side === "top")    { k = id - 21; x = -INNER + (k + 0.5) * TILE_W; z = -EDGE_C; }
  if (side === "right")  { k = id - 31; x = EDGE_C; z = -INNER + (k + 0.5) * TILE_W; }

  return { position: [x, 0, z], yaw: EDGE_YAW[side], edge: side, size: [TILE_W, TILE_D] };
}

// Unit world directions for a tile: `inward` points to the board centre (where
// the colour bar / houses go), `along` runs parallel to the edge.
export function tileDirs(id: number): { inward: [number, number]; along: [number, number] } {
  switch (tileSide(id)) {
    case "bottom": return { inward: [0, -1], along: [1, 0] };
    case "left":   return { inward: [1, 0], along: [0, 1] };
    case "top":    return { inward: [0, 1], along: [1, 0] };
    case "right":  return { inward: [-1, 0], along: [0, 1] };
    default:       return { inward: [0, 0], along: [1, 0] };
  }
}

// World XZ centre of a tile (convenience over tileTransform().position).
export function tileCenter(id: number): [number, number] {
  const t = tileTransform(id);
  return [t.position[0], t.position[2]];
}

// A small stable per-slot offset so several pawns sharing a tile don't overlap.
// Returns a world XZ offset for pawn index `i` on a tile of the given id.
export function pawnSlotOffset(id: number, i: number): [number, number] {
  const { inward, along } = tileDirs(id);
  const col = i % 2;          // two columns
  const row = Math.floor(i / 2); // stacked rows toward centre
  const a = (col - 0.5) * 0.34;         // along the edge
  const b = 0.12 + row * 0.34;          // toward centre
  return [along[0] * a + inward[0] * b, along[1] * a + inward[1] * b];
}

// Ordered list of tile ids a pawn passes through moving from `from` to `to`.
// Normal (short, forward) moves step tile-by-tile so the hop animation reads
// like a board game; long jumps (teleport cards, "go back") return just the
// endpoints so the pawn arcs directly there.
export function pathBetween(from: number, to: number): number[] {
  const forward = (to - from + 40) % 40;
  if (forward === 0) return [from];
  if (forward <= 12) {
    const out: number[] = [];
    for (let s = 0; s <= forward; s++) out.push((from + s) % 40);
    return out;
  }
  return [from, to]; // teleport / long jump — single arc
}
