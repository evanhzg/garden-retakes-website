// Client-side board schema: types + pure helpers for the board editor. Mirrors
// the server contract in scripts/boardDefs.js (the authoritative validator when
// a board is actually used in a game).

export type Currency = { symbol: string; position: "prefix" | "suffix" };
export type TileType = "corner" | "property" | "rail" | "util" | "tax" | "chance" | "chest" | "special";
export type CornerRole = "go" | "jail" | "freeParking" | "goToJail";
export type BuildingStyle = "classic" | "modern" | "tower" | "tent";
export type FaceStyle = "standard" | "minimal" | "bold";
export type FaceFill = "band" | "full" | "none";
export type FaceBorder = "none" | "thin" | "bold";

export type EffectType =
  | "reward" | "fee" | "collectAll" | "payAll" | "teleport" | "jail"
  | "extraRoll" | "skipTurn" | "drawChance" | "drawChest" | "safe";

export type Effect = { type: EffectType; amount?: number; target?: number };

// Board-level "modules" — game-wide mechanics beyond per-tile landing effects.
export type ModuleType = "worldCup" | "jackpot" | "auction";
export type BoardModule =
  | { type: "worldCup"; startTile?: number; multiplierStep?: number }
  | { type: "jackpot" }
  | { type: "auction" };
export const MODULE_LABELS: Record<ModuleType, string> = {
  worldCup: "World Cup — relocating rent multiplier",
  jackpot: "Free-Parking Jackpot — fees pile into a pot",
  auction: "Auction — declined tiles go to the highest bidder",
};
// Modules exposed in the editor.
export const EDITOR_MODULES: ModuleType[] = ["worldCup", "jackpot", "auction"];

export type Tile = {
  id: number;
  type: TileType;
  name: string;
  group?: string;
  price?: number;
  rent?: number[];
  houseCost?: number;
  amount?: number;         // tax
  effect?: Effect;         // special / POI tiles
  icon?: string;           // custom emoji/glyph
  color?: string;          // per-tile band / fill colour override
  buildingStyle?: BuildingStyle;
  faceStyle?: FaceStyle;
  fill?: FaceFill;         // band (default) | full-face colour | none
  textColor?: string;      // per-tile text colour override
  faceBorder?: FaceBorder; // outline weight
  role?: CornerRole;       // corner tiles only
};

export type Theme = {
  groupColors: Record<string, string>;
  tileBase: string;
  tileBaseCorner: string;
  plinth: string;
  field: string;
  accent: string;
  buildingStyle?: BuildingStyle;
  tileStyle?: FaceStyle;
  faceFill?: FaceFill;     // board-default tile fill mode
  textColor?: string;      // board-default tile text colour
  faceBorder?: FaceBorder; // board-default tile outline weight
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
  modules?: BoardModule[];
};

export const GROUP_KEYS = ["brown", "lightblue", "pink", "orange", "red", "yellow", "green", "blue"];
export const TILE_TYPES: TileType[] = ["property", "rail", "util", "tax", "chance", "chest", "special"];
export const BUILDING_STYLES: BuildingStyle[] = ["classic", "modern", "tower", "tent"];
export const FACE_STYLES: FaceStyle[] = ["standard", "minimal", "bold"];
export const FACE_FILLS: FaceFill[] = ["band", "full", "none"];
export const FACE_BORDERS: FaceBorder[] = ["none", "thin", "bold"];
export const EFFECT_TYPES: EffectType[] = [
  "reward", "fee", "collectAll", "payAll", "teleport", "jail", "extraRoll", "skipTurn", "drawChance", "drawChest", "safe",
];
export const EFFECT_LABELS: Record<EffectType, string> = {
  reward: "Reward (collect)", fee: "Fee (pay bank)", collectAll: "Collect from all", payAll: "Pay all players",
  teleport: "Teleport to tile", jail: "Go to jail", extraRoll: "Roll again", skipTurn: "Skip next turn",
  drawChance: "Draw Chance", drawChest: "Draw Community Chest", safe: "Safe (nothing)",
};
export const EFFECT_HAS_AMOUNT = new Set<EffectType>(["reward", "fee", "collectAll", "payAll"]);

export const DEFAULT_THEME: Theme = {
  groupColors: {
    brown: "#7b4a12", lightblue: "#8fd0ef", pink: "#d63b8f", orange: "#ef8c1c",
    red: "#e2231a", yellow: "#f4d200", green: "#1f9e4a", blue: "#1f5fd0",
    rail: "#2b3444", util: "#8aa0b8",
  },
  tileBase: "#f4efdf", tileBaseCorner: "#eae3cd",
  plinth: "#0a1a12", field: "#0c3b28", accent: "#22c55e",
  buildingStyle: "classic", tileStyle: "standard",
  faceFill: "band", textColor: "#14210f", faceBorder: "thin",
};

export const cornerIndicesOf = (perSide: number) => [0, perSide + 1, 2 * (perSide + 1), 3 * (perSide + 1)];
export const totalTiles = (perSide: number) => perSide * 4 + 4;
const rid = () => Math.random().toString(36).slice(2, 8);

// Corner indices of an arbitrary board (tiles flagged type "corner"), in order.
export const cornersOf = (def: BoardDef): number[] => def.tiles.filter((t) => t.type === "corner").map((t) => t.id);

function rentFor(price: number): number[] {
  return [
    Math.max(2, Math.round(price * 0.1)), Math.round(price * 0.5), Math.round(price * 1.5),
    Math.round(price * 4.5), Math.round(price * 6.25), Math.round(price * 7.5),
  ];
}

// Ring order of the 4 corners: GO, Jail, Free Parking, Go To Jail.
const CORNER_ROLE: CornerRole[] = ["go", "jail", "freeParking", "goToJail"];
const CORNER_NAME: Record<CornerRole, string> = { go: "GO", jail: "Jail", freeParking: "Free Parking", goToJail: "Go To Jail" };

function structuredCloneSafe<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }
export const cloneDef = (def: BoardDef): BoardDef => structuredCloneSafe(def);

// Build the roles map from corner tiles' `role` flags (falling back to order).
function rolesFromTiles(tiles: Tile[]): BoardDef["roles"] {
  const corners = tiles.filter((t) => t.type === "corner");
  const roles: any = {};
  corners.forEach((t, i) => { roles[t.role || CORNER_ROLE[i]] = t.id; });
  // guarantee all four exist
  CORNER_ROLE.forEach((r, i) => { if (roles[r] == null && corners[i]) roles[r] = corners[i].id; });
  return roles;
}

export function makeBlankBoard(perSide = 9, name = "My Board"): BoardDef {
  const corners = cornerIndicesOf(perSide);
  const tiles: Tile[] = [];
  let p = 0;
  for (let i = 0; i < totalTiles(perSide); i++) {
    const ci = corners.indexOf(i);
    if (ci >= 0) {
      const role = CORNER_ROLE[ci];
      tiles.push({ id: i, type: "corner", name: CORNER_NAME[role], role });
    } else {
      const group = GROUP_KEYS[p % GROUP_KEYS.length];
      const price = 60 + p * 20;
      tiles.push({ id: i, type: "property", name: `Tile ${i}`, group, price, rent: rentFor(price), houseCost: 50 + Math.floor(p / 4) * 50 });
      p++;
    }
  }
  return {
    id: "custom_" + rid(), name, perSide, startingMoney: 1500, passGo: 200,
    roles: { go: corners[0], jail: corners[1], freeParking: corners[2], goToJail: corners[3] },
    currency: { symbol: "$", position: "prefix" }, theme: structuredCloneSafe(DEFAULT_THEME), tiles, modules: [],
  };
}

// Runtime preview of a board's modules, mirroring the engine's initial state, so
// the editor's 3D preview can show the World Cup marker / jackpot pot.
export function moduleStatePreview(def: BoardDef): any {
  const mods = def.modules || [];
  const ownable = def.tiles.filter((t) => t.type === "property" || t.type === "rail" || t.type === "util").map((t) => t.id);
  const wc = mods.find((m) => m.type === "worldCup") as any;
  const jp = mods.find((m) => m.type === "jackpot");
  return {
    worldCup: wc
      ? { hostTileId: Number.isInteger(wc.startTile) && ownable.includes(wc.startTile) ? wc.startTile : (ownable[0] ?? null), level: 2, step: wc.multiplierStep > 0 ? wc.multiplierStep : 1 }
      : null,
    jackpot: jp ? { pot: 0 } : null,
    auction: null,
  };
}

// Reindex ids to array position; refresh roles from corner tiles.
export function normalizeBoard(def: BoardDef): BoardDef {
  const tiles = def.tiles.map((t, i) => ({ ...t, id: i }));
  // ensure corner tiles have a role
  let ci = 0;
  for (const t of tiles) if (t.type === "corner" && !t.role) t.role = CORNER_ROLE[ci++];
  return { ...def, tiles, roles: rolesFromTiles(tiles) };
}

export function resizeBoard(def: BoardDef, perSide: number): BoardDef {
  const blank = makeBlankBoard(perSide, def.name);
  blank.id = def.id;
  blank.theme = cloneDef(def).theme;
  blank.currency = { ...def.currency };
  blank.startingMoney = def.startingMoney;
  blank.passGo = def.passGo;

  const oldContent = def.tiles.filter((t) => t.type !== "corner");
  const newSlots = blank.tiles.map((_, i) => i).filter((i) => blank.tiles[i].type !== "corner");
  for (let j = 0; j < newSlots.length && j < oldContent.length; j++) {
    blank.tiles[newSlots[j]] = { ...oldContent[j], id: newSlots[j] };
  }
  const oldCorners = def.tiles.filter((t) => t.type === "corner");
  blank.tiles.filter((t) => t.type === "corner").forEach((t, k) => {
    if (oldCorners[k]) { t.name = oldCorners[k].name; t.icon = oldCorners[k].icon; }
  });
  return normalizeBoard(blank);
}

export function coerceTileForType(tile: Tile, type: TileType): Tile {
  const base: Tile = { id: tile.id, type, name: tile.name, icon: tile.icon, color: tile.color, faceStyle: tile.faceStyle, fill: tile.fill, textColor: tile.textColor, faceBorder: tile.faceBorder };
  if (type === "property") {
    const price = tile.price && tile.price > 0 ? tile.price : 100;
    return { ...base, group: tile.group && GROUP_KEYS.includes(tile.group) ? tile.group : "brown", price, rent: tile.rent && tile.rent.length === 6 ? tile.rent : rentFor(price), houseCost: tile.houseCost && tile.houseCost > 0 ? tile.houseCost : 50, buildingStyle: tile.buildingStyle };
  }
  if (type === "rail") return { ...base, group: "rail", price: tile.price && tile.price > 0 ? tile.price : 200, rent: [25, 50, 100, 200] };
  if (type === "util") return { ...base, group: "util", price: tile.price && tile.price > 0 ? tile.price : 150 };
  if (type === "tax") return { ...base, amount: tile.amount && tile.amount > 0 ? tile.amount : 100 };
  if (type === "special") return { ...base, effect: tile.effect || { type: "reward", amount: 100 } };
  return base; // chance / chest / corner
}

export function updateTile(def: BoardDef, id: number, patch: Partial<Tile>): BoardDef {
  return { ...def, tiles: def.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

// Move a non-corner tile to another non-corner slot (corners stay pinned).
export function moveTile(def: BoardDef, fromId: number, toId: number): BoardDef {
  const corners = new Set(cornersOf(def));
  if (corners.has(fromId) || fromId === toId) return def;
  const cornerTiles = def.tiles.filter((t) => corners.has(t.id));
  const nonCorner = def.tiles.filter((t) => !corners.has(t.id));
  const fromPos = nonCorner.findIndex((t) => t.id === fromId);
  if (fromPos < 0) return def;
  let toPos: number;
  if (corners.has(toId)) toPos = toId < fromId ? 0 : nonCorner.length - 1;
  else { toPos = nonCorner.findIndex((t) => t.id === toId); if (toPos < 0) return def; }
  const [moved] = nonCorner.splice(fromPos, 1);
  nonCorner.splice(toPos, 0, moved);

  const tiles: Tile[] = [];
  let ci = 0, nci = 0;
  for (let i = 0; i < def.tiles.length; i++) {
    if (corners.has(i)) tiles.push({ ...cornerTiles[ci++], id: i });
    else tiles.push({ ...nonCorner[nci++], id: i });
  }
  return normalizeBoard({ ...def, tiles });
}

// Delete a non-corner tile → board can become uneven / arbitrary size.
export function deleteTile(def: BoardDef, id: number): BoardDef {
  const corners = new Set(cornersOf(def));
  if (corners.has(id)) return def;
  if (def.tiles.length <= 12) return def; // keep a sane minimum
  return normalizeBoard({ ...def, tiles: def.tiles.filter((t) => t.id !== id) });
}

export function defToGameState(def: BoardDef): any {
  return {
    status: "PLAYING",
    board: def.tiles.map((t, i) => ({
      ...t, id: i, owner: null,
      ...(t.type === "property" || t.type === "rail" || t.type === "util" ? { mortgaged: false } : {}),
      ...(t.type === "property" ? { houses: 0 } : {}),
    })),
    players: [], playerStates: {}, currentTurn: null, lastRoll: null,
    boardId: def.id,
    moduleState: moduleStatePreview(def),
    boardMeta: {
      boardId: def.id, name: def.name, perSide: def.perSide, roles: def.roles,
      theme: def.theme, currency: def.currency, startingMoney: def.startingMoney, passGo: def.passGo,
      modules: def.modules || [],
    },
  };
}

// Mirrors scripts/boardDefs.js:validateBoard — arbitrary N with exactly 4 corners.
export function validateBoardClient(def: BoardDef): { ok: boolean; error?: string } {
  if (!def || typeof def !== "object") return { ok: false, error: "not an object" };
  const total = def.tiles?.length;
  if (!Array.isArray(def.tiles) || total < 12 || total > 80) return { ok: false, error: "board needs 12–80 tiles" };
  const corners = def.tiles.filter((t) => t.type === "corner").map((t) => t.id);
  if (corners.length !== 4) return { ok: false, error: `need exactly 4 corners (has ${corners.length})` };
  for (const r of ["go", "jail", "goToJail", "freeParking"] as const) {
    const v = def.roles?.[r];
    if (!Number.isInteger(v) || !corners.includes(v)) return { ok: false, error: `role ${r} must be a corner` };
  }
  for (let i = 0; i < def.tiles.length; i++) {
    const t = def.tiles[i];
    if (!t || !["corner", "property", "rail", "util", "tax", "chance", "chest", "special"].includes(t.type)) return { ok: false, error: `tile ${i} has invalid type` };
    if (t.type === "property" && (!(Number(t.price) > 0) || !Array.isArray(t.rent) || t.rent.length !== 6 || !(Number(t.houseCost) > 0)))
      return { ok: false, error: `property "${t.name || i}" needs price, 6 rents, house cost` };
    if ((t.type === "rail" || t.type === "util") && !(Number(t.price) > 0)) return { ok: false, error: `"${t.name || i}" needs a price` };
    if (t.type === "tax" && !(Number(t.amount) > 0)) return { ok: false, error: `tax "${t.name || i}" needs an amount` };
    if (t.type === "special" && !t.effect?.type) return { ok: false, error: `special "${t.name || i}" needs an effect` };
  }
  if (!(def.startingMoney > 0) || !(def.passGo >= 0)) return { ok: false, error: "bad starting money / GO salary" };
  if (def.modules != null) {
    if (!Array.isArray(def.modules)) return { ok: false, error: "modules must be a list" };
    for (const m of def.modules) {
      if (!m || !["worldCup", "jackpot", "auction"].includes((m as any).type)) return { ok: false, error: "unknown module type" };
    }
  }
  return { ok: true };
}
