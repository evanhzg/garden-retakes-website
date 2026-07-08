// Inventory simulator data model + persistence.
//
// Stored in localStorage for guests; synced to the database (keyed by SteamID64)
// when signed in. The shape carries the *numeric* CS2 economy ids the
// ianlucas inventory-simulator plugin needs (weapon `def`, paint `paint`,
// sticker kit `def`), so a saved loadout can be served verbatim to the plugin
// through /api/equipped/v4/{steamid}.json — see toEquippedV4() below.

export type Team = "ct" | "t" | "both";

export const STICKER_SLOTS = 4;

export type PlacedSticker = {
  /** Sticker kit index (plugin sticker `def`). */
  def: number;
  name: string;
  image: string;
  /** Slot 0..STICKER_SLOTS-1. */
  slot: number;
  /** Scratch/wear 0 (pristine) .. 1 (fully scratched). */
  wear: number;
  /** Position as a percentage of the 2D stage (website preview only). */
  x: number;
  y: number;
  rotation: number;
};

export type InventoryItem = {
  id: string;
  /** Stable numeric uid used by the plugin (StatTrak increments key off this). */
  uid: number;
  /** In-game weapon definition index. */
  weaponDef: number;
  weaponName: string;
  team: Team;
  /** cs2-lib item id of the chosen skin. */
  skinId: number;
  skinName: string;
  /** Paint kit index. */
  paint: number;
  image: string;
  wear: number;
  seed: number;
  statTrak: boolean;
  nameTag: string;
  stickers: (PlacedSticker | null)[];
  createdAt: number;
};

export type Loadout = {
  id: string;
  name: string;
  /** weaponDef -> InventoryItem id */
  equipped: Record<string, string>;
};

export type InventoryStore = {
  items: InventoryItem[];
  loadouts: Loadout[];
  activeLoadoutId: string;
  /** Monotonic counter so every item gets a unique, stable plugin uid. */
  nextUid: number;
};

const STORAGE_KEY = "garden-inventory-v2";

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function defaultStore(): InventoryStore {
  const loadout: Loadout = { id: newId(), name: "Loadout 1", equipped: {} };
  return { items: [], loadouts: [loadout], activeLoadoutId: loadout.id, nextUid: 1 };
}

export function defaultStickerSlots(): (PlacedSticker | null)[] {
  return Array.from({ length: STICKER_SLOTS }, () => null);
}

/** Default anchor positions for the sticker slots (percent of the stage). */
export const SLOT_ANCHORS: { x: number; y: number }[] = [
  { x: 24, y: 58 },
  { x: 42, y: 58 },
  { x: 60, y: 58 },
  { x: 78, y: 58 },
];

/** Normalise an arbitrary parsed object into a valid store. */
export function normaliseStore(parsed: Partial<InventoryStore> | null | undefined): InventoryStore {
  if (!parsed || !Array.isArray(parsed.loadouts) || parsed.loadouts.length === 0) {
    return defaultStore();
  }
  const store: InventoryStore = {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    loadouts: parsed.loadouts,
    activeLoadoutId: parsed.activeLoadoutId ?? parsed.loadouts[0].id,
    nextUid: parsed.nextUid && parsed.nextUid > 0 ? parsed.nextUid : 1,
  };
  if (!store.loadouts.some((l) => l.id === store.activeLoadoutId)) {
    store.activeLoadoutId = store.loadouts[0].id;
  }
  // Guarantee nextUid is always ahead of every existing uid.
  const maxUid = store.items.reduce((m, i) => Math.max(m, i.uid ?? 0), 0);
  if (store.nextUid <= maxUid) store.nextUid = maxUid + 1;
  return store;
}

export function loadStore(): InventoryStore {
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normaliseStore(raw ? (JSON.parse(raw) as InventoryStore) : null);
  } catch {
    return defaultStore();
  }
}

export function saveStore(store: InventoryStore) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

// ---------- Plugin serialisation ----------

type PluginSticker = { def: number; slot: number; wear: number };

type PluginWeapon = {
  def: number;
  hash: string;
  nametag: string;
  paint: number;
  seed: number;
  stattrak: number;
  wear: number;
  uid: number;
  stickers: PluginSticker[];
  keychains: [];
};

export type EquippedV4 = {
  ctWeapons: Record<number, PluginWeapon>;
  tWeapons: Record<number, PluginWeapon>;
};

function econHash(item: InventoryItem): string {
  const sticker = item.stickers
    .map((s) => (s ? `${s.def}@${s.slot}` : "-"))
    .join(",");
  return `${item.weaponDef}_${item.paint}_${item.seed}_${item.wear}_${item.statTrak ? 1 : 0}_${sticker}_${item.uid}`;
}

function toPluginWeapon(item: InventoryItem): PluginWeapon {
  const stickers: PluginSticker[] = [];
  item.stickers.forEach((s) => {
    if (s) stickers.push({ def: s.def, slot: s.slot, wear: s.wear });
  });
  return {
    def: item.weaponDef,
    hash: econHash(item),
    nametag: item.nameTag ?? "",
    paint: item.paint,
    seed: item.seed,
    stattrak: item.statTrak ? 0 : -1,
    wear: item.wear,
    uid: item.uid,
    stickers,
    keychains: [],
  };
}

/** Build the plugin's equipped-items payload for a loadout. */
export function toEquippedV4(store: InventoryStore, loadoutId?: string): EquippedV4 {
  const loadout =
    store.loadouts.find((l) => l.id === (loadoutId ?? store.activeLoadoutId)) ??
    store.loadouts[0];
  const result: EquippedV4 = { ctWeapons: {}, tWeapons: {} };
  if (!loadout) return result;

  for (const itemId of Object.values(loadout.equipped)) {
    const item = store.items.find((i) => i.id === itemId);
    if (!item) continue;
    const weapon = toPluginWeapon(item);
    if (item.team === "ct" || item.team === "both") result.ctWeapons[item.weaponDef] = weapon;
    if (item.team === "t" || item.team === "both") result.tWeapons[item.weaponDef] = weapon;
  }
  return result;
}
