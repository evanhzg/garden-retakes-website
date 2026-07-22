// Client-side board schema: types + pure helpers for the board editor. Mirrors
// the server contract in scripts/boardDefs.js (which stays the authoritative
// validator when a custom board is actually used in a game).

export type Currency = { symbol: string; position: "prefix" | "suffix" };
export type TileType = "corner" | "property" | "rail" | "util" | "tax" | "chance" | "chest";

export type Tile = {
  id: number;
  type: TileType;
  name: string;
  group?: string;
  price?: number;
  rent?: number[];       // 6 values for properties
  houseCost?: number;
  amount?: number;       // tax
  icon?: string;         // optional custom emoji/glyph on the tile face
};

export type Theme = {
  groupColors: Record<string, string>;
  tileBase: string;
  tileBaseCorner: string;
  plinth: string;
  field: string;
  accent: string;
};

export type BoardDef = {
  id: string;
  name: string;
  perSide: number;
  startingMoney: number;
  passGo: number;
  roles: { go: number; jail: number; goToJail: number; freeParking: number };
  currency: Currency;
  theme: Theme;
  tiles: Tile[];
};

// Property colour groups (rail/util are types, not colour groups, but carry a
// theme colour too).
export const GROUP_KEYS = ["brown", "lightblue", "pink", "orange", "red", "yellow", "green", "blue"];
export const TILE_TYPES: TileType[] = ["property", "rail", "util", "tax", "chance", "chest"];

export const DEFAULT_THEME: Theme = {
  groupColors: {
    brown: "#7b4a12", lightblue: "#8fd0ef", pink: "#d63b8f", orange: "#ef8c1c",
    red: "#e2231a", yellow: "#f4d200", green: "#1f9e4a", blue: "#1f5fd0",
    rail: "#2b3444", util: "#8aa0b8",
  },
  tileBase: "#f4efdf", tileBaseCorner: "#eae3cd",
  plinth: "#0a1a12", field: "#0c3b28", accent: "#22c55e",
};

export const cornerIndicesOf = (perSide: number) => [0, perSide + 1, 2 * (perSide + 1), 3 * (perSide + 1)];
export const totalTiles = (perSide: number) => perSide * 4 + 4;
const rid = () => Math.random().toString(36).slice(2, 8);

function rentFor(price: number): number[] {
  return [
    Math.max(2, Math.round(price * 0.1)),
    Math.round(price * 0.5),
    Math.round(price * 1.5),
    Math.round(price * 4.5),
    Math.round(price * 6.25),
    Math.round(price * 7.5),
  ];
}

const CORNER_NAMES = ["GO", "Jail", "Free Parking", "Go To Jail"];

// Fresh, valid board with placeholder properties around the ring.
export function makeBlankBoard(perSide = 9, name = "My Board"): BoardDef {
  const corners = cornerIndicesOf(perSide);
  const cornerName: Record<number, string> = {};
  corners.forEach((c, i) => (cornerName[c] = CORNER_NAMES[i]));
  const tiles: Tile[] = [];
  let p = 0;
  for (let i = 0; i < totalTiles(perSide); i++) {
    if (corners.includes(i)) {
      tiles.push({ id: i, type: "corner", name: cornerName[i] });
    } else {
      const group = GROUP_KEYS[p % GROUP_KEYS.length];
      const price = 60 + p * 20;
      tiles.push({ id: i, type: "property", name: `Tile ${i}`, group, price, rent: rentFor(price), houseCost: 50 + Math.floor(p / 4) * 50 });
      p++;
    }
  }
  return {
    id: "custom_" + rid(),
    name,
    perSide,
    startingMoney: 1500,
    passGo: 200,
    roles: { go: corners[0], jail: corners[1], goToJail: corners[2], freeParking: corners[3] },
    currency: { symbol: "$", position: "prefix" },
    theme: structuredCloneSafe(DEFAULT_THEME),
    tiles,
  };
}

function structuredCloneSafe<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

// Deep clone (defs are plain data).
export const cloneDef = (def: BoardDef): BoardDef => structuredCloneSafe(def);

// Reindex ids to array position; corners pinned to their slots; roles refreshed.
export function normalizeBoard(def: BoardDef): BoardDef {
  const corners = cornerIndicesOf(def.perSide);
  const tiles = def.tiles.map((t, i) => ({ ...t, id: i, type: corners.includes(i) ? "corner" as TileType : (t.type === "corner" ? "property" as TileType : t.type) }));
  return { ...def, tiles, roles: { go: corners[0], jail: corners[1], goToJail: corners[2], freeParking: corners[3] } };
}

// Resize the ring, preserving theme/economy and as much tile content as fits.
export function resizeBoard(def: BoardDef, perSide: number): BoardDef {
  const blank = makeBlankBoard(perSide, def.name);
  blank.id = def.id;
  blank.theme = cloneDef(def).theme;
  blank.currency = { ...def.currency };
  blank.startingMoney = def.startingMoney;
  blank.passGo = def.passGo;

  const oldCorners = cornerIndicesOf(def.perSide);
  const oldContent = def.tiles.filter((t) => !oldCorners.includes(t.id));
  const newCorners = cornerIndicesOf(perSide);
  const newSlots = blank.tiles.map((_, i) => i).filter((i) => !newCorners.includes(i));
  for (let j = 0; j < newSlots.length && j < oldContent.length; j++) {
    blank.tiles[newSlots[j]] = { ...oldContent[j], id: newSlots[j] };
  }
  // carry corner names across
  const oldCornerTiles = def.tiles.filter((t) => oldCorners.includes(t.id));
  newCorners.forEach((idx, k) => {
    if (oldCornerTiles[k]) blank.tiles[idx] = { ...oldCornerTiles[k], id: idx, type: "corner" };
  });
  return blank;
}

// Fill in the required fields when a tile's type changes.
export function coerceTileForType(tile: Tile, type: TileType): Tile {
  const base: Tile = { id: tile.id, type, name: tile.name, icon: tile.icon };
  if (type === "property") {
    const price = tile.price && tile.price > 0 ? tile.price : 100;
    return { ...base, group: tile.group && GROUP_KEYS.includes(tile.group) ? tile.group : "brown", price, rent: tile.rent && tile.rent.length === 6 ? tile.rent : rentFor(price), houseCost: tile.houseCost && tile.houseCost > 0 ? tile.houseCost : 50 };
  }
  if (type === "rail") return { ...base, group: "rail", price: tile.price && tile.price > 0 ? tile.price : 200, rent: [25, 50, 100, 200] };
  if (type === "util") return { ...base, group: "util", price: tile.price && tile.price > 0 ? tile.price : 150 };
  if (type === "tax") return { ...base, amount: tile.amount && tile.amount > 0 ? tile.amount : 100 };
  return base; // chance / chest / corner
}

// Immutably update one tile.
export function updateTile(def: BoardDef, id: number, patch: Partial<Tile>): BoardDef {
  return { ...def, tiles: def.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

// Move a non-corner tile to the position of another non-corner tile (corners
// stay pinned to their slots).
export function moveTile(def: BoardDef, fromId: number, toId: number): BoardDef {
  const corners = new Set(cornerIndicesOf(def.perSide));
  if (corners.has(fromId) || fromId === toId) return def;
  const cornerTiles = def.tiles.filter((t) => corners.has(t.id));
  const nonCorner = def.tiles.filter((t) => !corners.has(t.id));
  const fromPos = nonCorner.findIndex((t) => t.id === fromId);
  if (fromPos < 0) return def;
  // target position among non-corner tiles
  let toPos: number;
  if (corners.has(toId)) {
    // dropped on/near a corner — clamp to nearest non-corner end
    toPos = toId < fromId ? 0 : nonCorner.length - 1;
  } else {
    toPos = nonCorner.findIndex((t) => t.id === toId);
    if (toPos < 0) return def;
  }
  const [moved] = nonCorner.splice(fromPos, 1);
  nonCorner.splice(toPos, 0, moved);

  // rebuild the full ring: corners in their slots, non-corners in new order
  const tiles: Tile[] = [];
  let ci = 0, nci = 0;
  for (let i = 0; i < def.tiles.length; i++) {
    if (corners.has(i)) tiles.push({ ...cornerTiles[ci++], id: i, type: "corner" });
    else tiles.push({ ...nonCorner[nci++], id: i });
  }
  return { ...def, tiles };
}

// Wrap a board def as a minimal gameState the 3D <Board3D> can render.
export function defToGameState(def: BoardDef): any {
  return {
    status: "PLAYING",
    board: def.tiles.map((t, i) => ({
      ...t, id: i,
      owner: null,
      ...(t.type === "property" || t.type === "rail" || t.type === "util" ? { mortgaged: false } : {}),
      ...(t.type === "property" ? { houses: 0 } : {}),
    })),
    players: [],
    playerStates: {},
    currentTurn: null,
    lastRoll: null,
    boardId: def.id,
    boardMeta: {
      boardId: def.id, name: def.name, perSide: def.perSide, roles: def.roles,
      theme: def.theme, currency: def.currency, startingMoney: def.startingMoney, passGo: def.passGo,
    },
  };
}

// Client-side validation mirroring scripts/boardDefs.js:validateBoard.
export function validateBoardClient(def: BoardDef): { ok: boolean; error?: string } {
  if (!def || typeof def !== "object") return { ok: false, error: "not an object" };
  const perSide = def.perSide;
  if (!Number.isInteger(perSide) || perSide < 3 || perSide > 15) return { ok: false, error: "perSide must be 3–15" };
  const expected = totalTiles(perSide);
  if (!Array.isArray(def.tiles) || def.tiles.length !== expected) return { ok: false, error: `expected ${expected} tiles, got ${def.tiles?.length}` };
  for (const r of ["go", "jail", "goToJail", "freeParking"] as const) {
    const v = def.roles?.[r];
    if (!Number.isInteger(v) || v < 0 || v >= expected) return { ok: false, error: `role ${r} out of range` };
  }
  for (let i = 0; i < def.tiles.length; i++) {
    const t = def.tiles[i];
    if (!t || !["corner", "property", "rail", "util", "tax", "chance", "chest"].includes(t.type)) return { ok: false, error: `tile ${i} has invalid type` };
    if (t.type === "property" && (!(Number(t.price) > 0) || !Array.isArray(t.rent) || t.rent.length !== 6 || !(Number(t.houseCost) > 0)))
      return { ok: false, error: `property "${t.name || i}" needs price, 6 rents, house cost` };
    if ((t.type === "rail" || t.type === "util") && !(Number(t.price) > 0)) return { ok: false, error: `"${t.name || i}" needs a price` };
    if (t.type === "tax" && !(Number(t.amount) > 0)) return { ok: false, error: `tax "${t.name || i}" needs an amount` };
  }
  if (!(def.startingMoney > 0) || !(def.passGo >= 0)) return { ok: false, error: "bad starting money / GO salary" };
  return { ok: true };
}
