// Shared constants for the 3D Monopoly board. Colours mirror the 2D board's
// CSS (components/games/monopoly.css) so the classic content reads identically;
// the presentation is the modern "Business Tour"-style 3D scene.

// Colour-group hexes — must match the `.brown`, `.lightblue`, … rules in the CSS.
export const GROUP_COLORS: Record<string, string> = {
  brown: "#7b4a12",
  lightblue: "#8fd0ef",
  pink: "#d63b8f",
  orange: "#ef8c1c",
  red: "#e2231a",
  yellow: "#f4d200",
  green: "#1f9e4a",
  blue: "#1f5fd0",
  rail: "#2b3444",
  util: "#8aa0b8",
};

// Building colours (match .mono-house / .mono-hotel).
export const HOUSE_COLOR = "#16a34a";
export const HOTEL_COLOR = "#dc2626";

// ---------------------------------------------------------------------------
// Board geometry (world units). The classic board is an 11×11 square: four
// corner tiles + nine edge tiles per side.
// ---------------------------------------------------------------------------
export const TILE_W = 1.0;    // edge-tile width, along the perimeter
export const TILE_D = 1.32;   // edge-tile depth, toward the centre
export const CORNER = 1.32;   // corner tiles are square
export const TILE_H = 0.18;   // tile slab thickness
export const SURFACE_Y = TILE_H; // top surface where pawns / houses / dice sit

// Side length = 2 corners + 9 edge tiles; half-extent to the outer edge.
export const SIDE_LEN = 2 * CORNER + 9 * TILE_W;
export const HALF = SIDE_LEN / 2;
// Inner playfield half-extent (where the centre panel / dice live).
export const FIELD_HALF = HALF - TILE_D;

// Palette for the board plinth / centre panel — deep, glossy, on-brand with
// the surrounding .mono-root gradient (dark navy + green/blue accents).
export const PALETTE = {
  plinth: "#0a1a12",
  plinthEdge: "#05120c",
  field: "#0c3b28",
  fieldLine: "#1f6f4a",
  tileBase: "#f4efdf",
  tileBaseCorner: "#eae3cd",
  accentGreen: "#22c55e",
  accentBlue: "#3b82f6",
};
