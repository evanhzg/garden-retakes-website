// RE5WS Manager: the in-game loadout manager's view of a player's inventory.
//
// The manager is a Panorama window drawn by a CS2 map script (the
// re5ws_manager Workshop addon); the R5e-games plugin is its only link to this
// site. The plugin calls app/api/re5ws/* with the server key, and this file is
// what those routes do to the stored inventory — kept free of the database and
// of the item catalog (both passed in) so the rules can be tested on their own.
//
// The state sent to the game is compact on purpose: it travels to the map
// script through entity names (see the addon), so item pictures and ids are
// left to what the game already knows (definition index + paint kit).

import {
  LOADOUT_COLORS,
  M4A1S,
  M4A4,
  defaultStickerSlots,
  emptyLoadout,
  newId,
  rarityOf,
  type InventoryItem,
  type InventoryStore,
  type ItemKind,
  type Loadout,
  type Team,
} from "./inventory";

export type Side = "t" | "ct";

/** A loadout slot: a weapon definition index ("7"), or one of the dedicated slots. */
export type SlotKey = string;
export const SPECIAL_SLOTS = ["knife", "gloves", "agent", "music"] as const;

/** Weapons with a slot in the manager (the game's paintable guns). */
export const WEAPON_DEFS = new Set([
  1, 2, 3, 4, 7, 8, 9, 10, 11, 13, 14, 16, 17, 19, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38,
  39, 40, 60, 61, 63, 64,
]);

export const NAME_MAX = 32;
export const LOADOUTS_MAX = 40;

/** The game-facing numbers for what the site stores by catalog id. */
export type GameIds = {
  agentDef: (value: number) => number;
  musicKitDef: (value: number) => number;
};

/** A catalog entry as the manager can add it (resolved by the route from cs2-lib). */
export type CatalogPick = {
  kind: ItemKind;
  /** What InventoryItem.weaponDef holds for it (weapon/knife/glove def, or the catalog id for agents and music kits). */
  weaponDef: number;
  weaponName: string;
  team: Team;
  skinId: number;
  skinName: string;
  paint: number;
  image: string;
  rarity: string;
  wearMin: number;
};

export type Re5wsItem = {
  id: string;
  /** w weapon, k knife, g gloves, a agent, m music kit */
  k: "w" | "k" | "g" | "a" | "m";
  /** game definition index (agents and music kits translated) */
  d: number;
  p: number;
  n: string;
  /** rarity tier 0-6, -1 unknown */
  r: number;
  /** wear, -1 when the item has none */
  f: number;
  s: boolean;
  /** agents: the side they belong to */
  t: "" | Side;
};

export type Re5wsLoadout = {
  id: string;
  n: string;
  /** index in LOADOUT_COLORS, -1 for a colour outside it */
  c: number;
  a: boolean;
  /** slot key -> index into items, per side */
  T: Record<string, number>;
  C: Record<string, number>;
};

export type Re5wsState = { items: Re5wsItem[]; loadouts: Re5wsLoadout[] };

const KIND_LETTER: Record<string, Re5wsItem["k"] | undefined> = {
  weapon: "w", knife: "k", gloves: "g", agent: "a", musickit: "m",
};

export function isSlotKey(key: unknown): key is SlotKey {
  if (typeof key !== "string") return false;
  if ((SPECIAL_SLOTS as readonly string[]).includes(key)) return true;
  return /^\d+$/.test(key) && WEAPON_DEFS.has(Number(key));
}

export const isSide = (side: unknown): side is Side => side === "t" || side === "ct";

function kindOfSlot(key: SlotKey): ItemKind {
  if (key === "knife") return "knife";
  if (key === "gloves") return "gloves";
  if (key === "agent") return "agent";
  if (key === "music") return "musickit";
  return "weapon";
}

/** Whether an item may go in a slot on a side. */
export function fits(item: InventoryItem, key: SlotKey, side: Side): boolean {
  const kind = kindOfSlot(key);
  if ((item.kind ?? "weapon") !== kind) return false;
  if (kind === "weapon") return item.weaponDef === Number(key);
  if (kind === "agent") return item.team === "both" || item.team === side;
  return true;
}

/** What a slot holds in a loadout (an item id), on a side. */
export function slotItem(loadout: Loadout, side: Side, key: SlotKey): string | undefined {
  const t = side === "t";
  switch (key) {
    case "knife": return t ? loadout.knifeT : loadout.knifeCT;
    case "gloves": return t ? loadout.glovesT : loadout.glovesCT;
    case "agent": return t ? loadout.agentT : loadout.agentCT;
    case "music": return t ? loadout.musicKitT : loadout.musicKitCT;
    default: return (t ? loadout.equippedT : loadout.equippedCT)[key];
  }
}

function setSlot(loadout: Loadout, side: Side, key: SlotKey, itemId: string | undefined) {
  const t = side === "t";
  switch (key) {
    case "knife": if (t) loadout.knifeT = itemId; else loadout.knifeCT = itemId; return;
    case "gloves": if (t) loadout.glovesT = itemId; else loadout.glovesCT = itemId; return;
    case "agent": if (t) loadout.agentT = itemId; else loadout.agentCT = itemId; return;
    case "music": if (t) loadout.musicKitT = itemId; else loadout.musicKitCT = itemId; return;
    default: {
      const map = t ? loadout.equippedT : loadout.equippedCT;
      if (itemId) map[key] = itemId;
      else delete map[key];
      if (!t && itemId && (Number(key) === M4A4 || Number(key) === M4A1S)) loadout.preferredM4 = Number(key);
    }
  }
}

const colorIndex = (hex?: string) => LOADOUT_COLORS.findIndex((c) => c.hex.toLowerCase() === (hex ?? "").toLowerCase());

/** The store as the manager sees it. */
export function stateOf(store: InventoryStore, ids: GameIds): Re5wsState {
  const index = new Map<string, number>();
  const items: Re5wsItem[] = [];
  for (const it of store.items) {
    const k = KIND_LETTER[it.kind ?? "weapon"];
    if (!k) continue;   // patches and charms have no slot of their own
    index.set(it.id, items.length);
    const d = k === "a" ? ids.agentDef(it.weaponDef) : k === "m" ? ids.musicKitDef(it.weaponDef) : it.weaponDef;
    items.push({
      id: it.id, k, d, p: it.paint ?? 0, n: it.skinName || it.weaponName || "Item",
      r: rarityOf(it.rarity)?.tier ?? -1,
      f: k === "a" || k === "m" ? -1 : Number.isFinite(it.wear) ? it.wear : -1,
      s: !!it.statTrak,
      t: k === "a" && (it.team === "t" || it.team === "ct") ? it.team : "",
    });
  }
  const sideMap = (l: Loadout, side: Side) => {
    const out: Record<string, number> = {};
    const add = (key: string, id?: string) => {
      const i = id ? index.get(id) : undefined;
      if (i !== undefined) out[key] = i;
    };
    for (const [def, id] of Object.entries(side === "t" ? l.equippedT : l.equippedCT)) add(def, id);
    for (const key of SPECIAL_SLOTS) add(key, slotItem(l, side, key));
    return out;
  };
  return {
    items,
    loadouts: store.loadouts.map((l) => ({
      id: l.id, n: l.name, c: colorIndex(l.color), a: l.id === store.activeLoadoutId,
      T: sideMap(l, "t"), C: sideMap(l, "ct"),
    })),
  };
}

export type EditOp =
  | { op: "equip"; loadoutId: string; side: Side; slot: SlotKey; itemId: string | null }
  | { op: "equipNew"; loadoutId: string; side: Side; slot: SlotKey; catalogId: number }
  | { op: "create"; name?: string }
  | { op: "copy"; loadoutId: string }
  | { op: "delete"; loadoutId: string }
  | { op: "activate"; loadoutId: string }
  | { op: "rename"; loadoutId: string; name: string }
  | { op: "color"; loadoutId: string };

export type EditResult =
  | { ok: true; message: string; /** the loadout in use changed: the game should re-fetch skins */ affectsGame: boolean }
  | { ok: false; error: string };

/** Parse an untrusted request body into an operation. */
export function parseOp(body: Record<string, unknown>): EditOp | string {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const loadoutId = s(body.loadoutId);
  switch (body.op) {
    case "equip":
    case "equipNew": {
      if (!loadoutId) return "loadoutId required";
      if (!isSide(body.side)) return "side must be t or ct";
      if (!isSlotKey(body.slot)) return "unknown slot";
      if (body.op === "equip") {
        const itemId = body.itemId === null || body.itemId === undefined || body.itemId === "" ? null : s(body.itemId);
        return { op: "equip", loadoutId, side: body.side, slot: body.slot, itemId };
      }
      const catalogId = Number(body.catalogId);
      if (!Number.isInteger(catalogId) || catalogId <= 0) return "catalogId required";
      return { op: "equipNew", loadoutId, side: body.side, slot: body.slot, catalogId };
    }
    case "create":
      return { op: "create", name: s(body.name) || undefined };
    case "rename":
      if (!loadoutId) return "loadoutId required";
      return { op: "rename", loadoutId, name: s(body.name) };
    case "copy":
    case "delete":
    case "activate":
    case "color":
      if (!loadoutId) return "loadoutId required";
      return { op: body.op, loadoutId };
    default:
      return "unknown op";
  }
}

export function cleanName(name: string): string {
  // Chat text: no control characters, single spaces, the site's own length.
  return Array.from(name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()).slice(0, NAME_MAX).join("");
}

function uniqueName(store: InventoryStore, wanted: string): string {
  const taken = new Set(store.loadouts.map((l) => l.name.trim().toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; ; n++) {
    const candidate = cleanName(`${wanted.slice(0, NAME_MAX - 4)} ${n}`);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Apply an operation to the store, in place. `catalog` resolves a catalog id
 * for equipNew (undefined when unknown).
 */
export function applyOp(
  store: InventoryStore,
  op: EditOp,
  catalog: (id: number) => CatalogPick | undefined,
  now: () => number = Date.now,
): EditResult {
  const find = (id: string) => store.loadouts.find((l) => l.id === id);

  switch (op.op) {
    case "create": {
      if (store.loadouts.length >= LOADOUTS_MAX) return { ok: false, error: `At most ${LOADOUTS_MAX} loadouts` };
      const name = uniqueName(store, cleanName(op.name ?? "") || `Loadout ${store.loadouts.length + 1}`);
      const l = emptyLoadout(name);
      l.color = LOADOUT_COLORS[store.loadouts.length % LOADOUT_COLORS.length].hex;
      l.createdAt = now();
      store.loadouts.push(l);
      return { ok: true, message: `Created ${name}`, affectsGame: false };
    }
    case "copy": {
      const src = find(op.loadoutId);
      if (!src) return { ok: false, error: "That loadout no longer exists" };
      if (store.loadouts.length >= LOADOUTS_MAX) return { ok: false, error: `At most ${LOADOUTS_MAX} loadouts` };
      const copy: Loadout = JSON.parse(JSON.stringify(src));
      copy.id = newId();
      copy.name = uniqueName(store, cleanName(`${src.name} copy`));
      copy.favorite = false;
      copy.createdAt = now();
      store.loadouts.push(copy);
      return { ok: true, message: `Duplicated as ${copy.name}`, affectsGame: false };
    }
    case "delete": {
      const i = store.loadouts.findIndex((l) => l.id === op.loadoutId);
      if (i < 0) return { ok: false, error: "That loadout no longer exists" };
      if (store.loadouts.length <= 1) return { ok: false, error: "You need at least one loadout" };
      const [gone] = store.loadouts.splice(i, 1);
      const wasActive = store.activeLoadoutId === gone.id;
      if (wasActive) store.activeLoadoutId = store.loadouts[0].id;
      return { ok: true, message: `Deleted ${gone.name}`, affectsGame: wasActive };
    }
    case "activate": {
      const l = find(op.loadoutId);
      if (!l) return { ok: false, error: "That loadout no longer exists" };
      const changed = store.activeLoadoutId !== l.id;
      store.activeLoadoutId = l.id;
      return { ok: true, message: `${l.name} is now in use`, affectsGame: changed };
    }
    case "rename": {
      const l = find(op.loadoutId);
      if (!l) return { ok: false, error: "That loadout no longer exists" };
      const name = cleanName(op.name);
      if (!name) return { ok: false, error: "The name is empty" };
      l.name = name;
      return { ok: true, message: `Renamed to ${name}`, affectsGame: false };
    }
    case "color": {
      const l = find(op.loadoutId);
      if (!l) return { ok: false, error: "That loadout no longer exists" };
      const next = (colorIndex(l.color) + 1) % LOADOUT_COLORS.length;
      l.color = LOADOUT_COLORS[next].hex;
      return { ok: true, message: `Colour: ${LOADOUT_COLORS[next].name}`, affectsGame: false };
    }
    case "equip": {
      const l = find(op.loadoutId);
      if (!l) return { ok: false, error: "That loadout no longer exists" };
      if (op.itemId === null) {
        setSlot(l, op.side, op.slot, undefined);
        return { ok: true, message: "Back to the default", affectsGame: l.id === store.activeLoadoutId };
      }
      const item = store.items.find((i) => i.id === op.itemId);
      if (!item) return { ok: false, error: "That item is no longer in your inventory" };
      if (!fits(item, op.slot, op.side)) return { ok: false, error: "That item does not go in this slot" };
      setSlot(l, op.side, op.slot, item.id);
      return { ok: true, message: `Equipped ${item.skinName}`, affectsGame: l.id === store.activeLoadoutId };
    }
    case "equipNew": {
      const l = find(op.loadoutId);
      if (!l) return { ok: false, error: "That loadout no longer exists" };
      const pick = catalog(op.catalogId);
      if (!pick) return { ok: false, error: "Unknown skin" };
      const wear = pick.kind === "agent" || pick.kind === "musickit" ? 0 : pick.wearMin;
      const fresh: InventoryItem = {
        id: newId(), uid: store.nextUid, kind: pick.kind, weaponDef: pick.weaponDef, weaponName: pick.weaponName,
        team: pick.team, skinId: pick.skinId, skinName: pick.skinName, paint: pick.paint, image: pick.image,
        rarity: pick.rarity, wear, seed: 1, statTrak: false, nameTag: "", stickers: defaultStickerSlots(),
        charm: null, createdAt: now(), source: "re5ws",
      };
      if (!fits(fresh, op.slot, op.side)) return { ok: false, error: "That skin does not go in this slot" };
      // The simulator's own rule: an identical item is reused, not duplicated.
      let item = store.items.find((i) =>
        i.weaponDef === pick.weaponDef && i.skinId === pick.skinId && i.wear === wear && i.seed === 1 &&
        !i.statTrak && !i.nameTag && (i.stickers ?? []).every((s) => !s) && !i.charm);
      if (!item) {
        item = fresh;
        store.nextUid += 1;
        store.items.unshift(item);
      }
      setSlot(l, op.side, op.slot, item.id);
      return { ok: true, message: `Added and equipped ${item.skinName}`, affectsGame: l.id === store.activeLoadoutId };
    }
  }
}
