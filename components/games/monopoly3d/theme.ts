// Constants + fallbacks for the 3D board. A live game's colours/theme come from
// `gameState.boardMeta.theme`; these values are the defaults used when no board
// meta is available (e.g. the editor preview before a theme is chosen).

// Fallback colour-group hexes (classic board).
export const GROUP_COLORS: Record<string, string> = {
  brown: "#9a6a43",
  lightblue: "#82c4e2",
  pink: "#d95d9c",
  orange: "#ef9440",
  red: "#e15554",
  yellow: "#efc04c",
  green: "#3fa96b",
  blue: "#4571c6",
  rail: "#3a4557",
  util: "#93a7bc",
};

// Building colours.
export const HOUSE_COLOR = "#16a34a";
export const HOTEL_COLOR = "#dc2626";

// ---------------------------------------------------------------------------
// Per-tile geometry (world units) — constant regardless of board size. The
// board's overall extent is derived from these plus the tiles-per-side in
// layout.ts, so bigger boards simply grow outward.
// ---------------------------------------------------------------------------
export const TILE_W = 1.0;    // edge-tile width, along the perimeter
export const TILE_D = 1.32;   // edge-tile depth, toward the centre
export const CORNER = 1.32;   // corner tiles are square
export const TILE_H = 0.18;   // tile slab thickness
export const SURFACE_Y = TILE_H; // top surface where pawns / houses / dice sit

// Fallback material palette (used when boardMeta.theme is absent).
export const PALETTE = {
  plinth: "#0b1a13",
  field: "#0e4632",
  accent: "#2fb464",
  tileBase: "#f6f2e8",
  tileBaseCorner: "#ece5d4",
};

// Resolve a theme object from board meta, filling any gaps with fallbacks.
export function resolveTheme(theme?: any) {
  return {
    groupColors: { ...GROUP_COLORS, ...(theme?.groupColors || {}) },
    tileBase: theme?.tileBase ?? PALETTE.tileBase,
    tileBaseCorner: theme?.tileBaseCorner ?? PALETTE.tileBaseCorner,
    plinth: theme?.plinth ?? PALETTE.plinth,
    field: theme?.field ?? PALETTE.field,
    accent: theme?.accent ?? PALETTE.accent,
  };
}
