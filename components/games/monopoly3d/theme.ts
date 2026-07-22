// Constants + fallbacks for the 3D board. A live game's colours/theme come from
// `gameState.boardMeta.theme`; these values are the defaults used when no board
// meta is available (e.g. the editor preview before a theme is chosen).

// Fallback colour-group hexes (classic board).
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
  plinth: "#0a1a12",
  field: "#0c3b28",
  accent: "#22c55e",
  tileBase: "#f4efdf",
  tileBaseCorner: "#eae3cd",
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
