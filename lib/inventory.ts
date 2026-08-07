// Inventory simulator data model + persistence.
//
// Stored in localStorage for guests; synced to the database (keyed by SteamID64)
// when signed in. The shape carries the *numeric* CS2 economy ids the
// Garden-inventory plugin (ianlucas fork) needs (weapon `def`, paint `paint`,
// sticker kit `def`), so a saved loadout can be served verbatim to the plugin
// through /api/equipped/v4/{steamid}.json — see toEquippedV4() below.
//
// v3: loadouts are PER SIDE. Every weapon slot exists separately for T and CT
// (a different Deagle on each side, an AK on CT, an M4 on T...), plus dedicated
// per-side knife and glove slots. Legacy v2 stores are migrated transparently.

export type Team = "ct" | "t" | "both";
export type ItemKind = "weapon" | "knife" | "gloves" | "agent" | "patch" | "charm";
export type Side = "t" | "ct";

export const STICKER_SLOTS = 5;

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
  x?: number;
  y?: number;
  rotation?: number;
};

export type InventoryItem = {
  id: string;
  /** Stable numeric uid used by the plugin (StatTrak increments key off this). */
  uid: number;
  kind: ItemKind;
  /** In-game item definition index (weapon / knife type / glove type). */
  weaponDef: number;
  weaponName: string;
  /** The item's native side in the game files (display hint only — any item can be equipped on any side). */
  team: Team;
  /** cs2-lib item id of the chosen skin. */
  skinId: number;
  skinName: string;
  /** Paint kit index. */
  paint: number;
  image: string;
  /**
   * Rarity colour (hex) as cs2-lib reports it. Optional: stores written before
   * the equipped board existed have no rarity, and the board falls back to the
   * neutral tier rather than refusing to render them.
   */
  rarity?: string;
  wear: number;
  seed: number;
  statTrak: boolean;
  nameTag: string;
  stickers: (PlacedSticker | null)[];
  charm?: PlacedSticker | null;
  createdAt: number;
};

export type Loadout = {
  id: string;
  name: string;
  /** weaponDef -> InventoryItem id, per side. */
  equippedCT: Record<string, string>;
  equippedT: Record<string, string>;
  /** Dedicated slots (InventoryItem ids). */
  knifeCT?: string;
  knifeT?: string;
  glovesCT?: string;
  glovesT?: string;
  agentCT?: string;
  agentT?: string;
  equippedPatchesCT?: string[];
  equippedPatchesT?: string[];
  /** Accent colour for visibility & sorting (hex, from LOADOUT_COLORS). */
  color?: string;
  /** Preferred CT rifle def for the profile preview: 16 = M4A4, 60 = M4A1-S. */
  preferredM4?: number;
  favorite?: boolean;
  createdAt?: number;
};

export type InventoryStore = {
  items: InventoryItem[];
  /** Canonical order = the array order (drag-drop reorders + persists it). */
  loadouts: Loadout[];
  activeLoadoutId: string;
  /** Monotonic counter so every item gets a unique, stable plugin uid. */
  nextUid: number;
  /** Favourited catalog skins, as "def:paint" keys. */
  favorites?: string[];
};

/** Preset loadout accent colours (label + hex). */
export const LOADOUT_COLORS: { name: string; hex: string }[] = [
  { name: "Purple", hex: "#a855f7" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Green", hex: "#22c55e" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Red", hex: "#ef4444" },
  { name: "Slate", hex: "#64748b" },
];

/**
 * CS2 rarity tiers, lowest first.
 *
 * cs2-lib reports rarity as the colour hex rather than a name, and the same
 * tier ships under more than one hex (the golds especially), so this maps every
 * hex we see onto one tier. `tier` doubles as the sort rank in the chooser.
 */
export const RARITY_TIERS: { tier: number; name: string; hexes: string[] }[] = [
  { tier: 0, name: "Consumer", hexes: ["#b0c3d9"] },
  { tier: 1, name: "Industrial", hexes: ["#5e98d9"] },
  { tier: 2, name: "Mil-Spec", hexes: ["#4b69ff"] },
  { tier: 3, name: "Restricted", hexes: ["#8847ff"] },
  { tier: 4, name: "Classified", hexes: ["#d32ce6"] },
  { tier: 5, name: "Covert", hexes: ["#eb4b4b"] },
  { tier: 6, name: "Exceedingly rare", hexes: ["#e4ae39", "#ffd700", "#ffae39"] },
];

const RARITY_BY_HEX = new Map(
  RARITY_TIERS.flatMap((t) => t.hexes.map((hex) => [hex, t] as const))
);

/** Tier for a rarity hex, or null when it is missing or unrecognised. */
export function rarityOf(hex?: string | null) {
  return hex ? RARITY_BY_HEX.get(hex.toLowerCase()) ?? null : null;
}

export const rarityRank = (hex?: string | null) => rarityOf(hex)?.tier ?? -1;
export const rarityName = (hex?: string | null) => rarityOf(hex)?.name ?? "Unknown";

/** Stable key for a catalog skin (used for favourites). */
export function skinKey(def: number, paint: number): string {
  return `${def}:${paint}`;
}

const STORAGE_KEY = "garden-inventory-v2";

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyLoadout(name: string): Loadout {
  return { 
    id: newId(), 
    name, 
    equippedCT: {}, 
    equippedT: {}, 
    color: LOADOUT_COLORS[0].hex, 
    preferredM4: M4A4, 
    createdAt: Date.now(), 
    equippedPatchesCT: [], 
    equippedPatchesT: [] 
  };
}

export function defaultStore(): InventoryStore {
  const loadout = emptyLoadout("Loadout 1");
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

export const M4A4 = 16;
export const M4A1S = 60;

/**
 * The slots the equipped board always shows, per side.
 *
 * Shared with the profile preview so both surfaces agree on what "your
 * loadout" means. The board renders these in order whether or not they are
 * filled — an empty slot you can see and click is the point — and appends any
 * *other* weapon equipped on that side after them, so nothing is ever hidden.
 */
export const SIGNATURE_SLOTS: Record<Side, { def: number; label: string; m4?: boolean }[]> = {
  t: [
    { def: 7, label: "AK-47" },
    { def: 9, label: "AWP" },
    { def: 1, label: "Desert Eagle" },
    { def: 4, label: "Glock-18" },
  ],
  ct: [
    { def: M4A4, label: "M4", m4: true },
    { def: 9, label: "AWP" },
    { def: 1, label: "Desert Eagle" },
    { def: 61, label: "USP-S" },
  ],
};

/** Signature guns + knife + gloves, both sides — the completeness denominator. */
export const TOTAL_SIGNATURE_SLOTS =
  (SIGNATURE_SLOTS.t.length + 2) + (SIGNATURE_SLOTS.ct.length + 2);

/** Loadout item count across both sides (for the switcher badges). */
export function loadoutSize(loadout: Loadout): number {
  return (
    Object.keys(loadout.equippedCT).length +
    Object.keys(loadout.equippedT).length +
    (loadout.knifeCT ? 1 : 0) +
    (loadout.knifeT ? 1 : 0) +
    (loadout.glovesCT ? 1 : 0) +
    (loadout.glovesT ? 1 : 0)
  );
}

type LegacyLoadout = Loadout & { equipped?: Record<string, string> };

/** Migrate a single loadout (handles the v2 single-`equipped` shape). */
function normaliseLoadout(raw: LegacyLoadout, itemTeam: (id: string) => Team): Loadout {
  const loadout: Loadout = {
    id: raw.id ?? newId(),
    name: raw.name ?? "Loadout",
    equippedCT: raw.equippedCT ?? {},
    equippedT: raw.equippedT ?? {},
    knifeCT: raw.knifeCT,
    knifeT: raw.knifeT,
    glovesCT: raw.glovesCT,
    glovesT: raw.glovesT,
    color: raw.color,
    preferredM4: raw.preferredM4,
  };

  // v2 -> v3: split the single map by the item's native team.
  if (raw.equipped && !raw.equippedCT && !raw.equippedT) {
    for (const [def, itemId] of Object.entries(raw.equipped)) {
      const team = itemTeam(itemId);
      if (team === "ct" || team === "both") loadout.equippedCT[def] = itemId;
      if (team === "t" || team === "both") loadout.equippedT[def] = itemId;
    }
  }

  return loadout;
}

/** Normalise an arbitrary parsed object into a valid store. */
export function normaliseStore(parsed: Partial<InventoryStore> | null | undefined): InventoryStore {
  if (!parsed || !Array.isArray(parsed.loadouts) || parsed.loadouts.length === 0) {
    return defaultStore();
  }

  const items: InventoryItem[] = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    kind: item.kind ?? "weapon",
    stickers: Array.isArray(item.stickers) ? item.stickers : defaultStickerSlots(),
  }));
  const teamOf = (id: string): Team => items.find((i) => i.id === id)?.team ?? "both";

  const store: InventoryStore = {
    items,
    loadouts: (parsed.loadouts as LegacyLoadout[]).map((l) => normaliseLoadout(l, teamOf)),
    activeLoadoutId: parsed.activeLoadoutId ?? parsed.loadouts[0].id,
    nextUid: parsed.nextUid && parsed.nextUid > 0 ? parsed.nextUid : 1,
    favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((f) => typeof f === "string") : [],
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

/** Resolve a loadout by id or (case-insensitive) name; falls back to the active one. */
export function findLoadout(store: InventoryStore, ref?: string | null): Loadout | undefined {
  if (ref) {
    const byId = store.loadouts.find((l) => l.id === ref);
    if (byId) return byId;
    const needle = ref.trim().toLowerCase();
    const byName = store.loadouts.find((l) => l.name.trim().toLowerCase() === needle);
    if (byName) return byName;
  }
  return store.loadouts.find((l) => l.id === store.activeLoadoutId) ?? store.loadouts[0];
}

// ---------- Plugin serialisation ----------

type PluginSticker = {
  def: number;
  slot: number;
  wear: number;
  rotation?: number;
  x?: number;
  y?: number;
};

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
  keychains: any[];
};

export type EquippedV4 = {
  ctWeapons: Record<number, PluginWeapon>;
  tWeapons: Record<number, PluginWeapon>;
  /** Keyed by engine team number: 2 = T, 3 = CT. */
  knives: Record<number, PluginWeapon>;
  gloves: Record<number, PluginWeapon>;
  agents: Record<number, PluginWeapon>;
  patches: Record<number, PluginWeapon>;
};

function econHash(item: InventoryItem): string {
  const sticker = item.stickers.map((s) => (s ? `${s.def}@${s.slot}` : "-")).join(",");
  return `${item.weaponDef}_${item.paint}_${item.seed}_${item.wear}_${item.statTrak ? 1 : 0}_${sticker}_${item.uid}`;
}

function toPluginWeapon(item: InventoryItem): PluginWeapon {
  const stickers: PluginSticker[] = [];
  item.stickers.forEach((s) => {
    if (!s) return;
    const sticker: PluginSticker = { def: s.def, slot: s.slot, wear: s.wear };
    if (s.rotation !== undefined) sticker.rotation = s.rotation;
    if (s.x !== undefined) sticker.x = s.x;
    if (s.y !== undefined) sticker.y = s.y;
    stickers.push(sticker);
  });
  const keychains: any[] = [];
  if (item.charm) {
    const c: any = { 
      def: item.charm.def, 
      slot: item.charm.slot ?? 0, 
      seed: Math.floor((item.charm.wear || 0) * 100000) 
    };
    if (item.charm.x !== undefined) c.x = item.charm.x;
    if (item.charm.y !== undefined) c.y = item.charm.y;
    if (item.charm.rotation !== undefined) c.z = item.charm.rotation; // Fallback mapping rotation to Z
    keychains.push(c);
  }

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
    keychains,
  };
}

/** Build the plugin's equipped-items payload for a loadout (by id or name). */
export function toEquippedV4(store: InventoryStore, loadoutRef?: string | null): EquippedV4 {
  const loadout = findLoadout(store, loadoutRef);
  const result: EquippedV4 = { ctWeapons: {}, tWeapons: {}, knives: {}, gloves: {}, agents: {}, patches: {} };
  if (!loadout) return result;

  const itemById = (id: string | undefined) =>
    id ? store.items.find((i) => i.id === id) : undefined;

  for (const [def, itemId] of Object.entries(loadout.equippedCT)) {
    const item = itemById(itemId);
    if (item) result.ctWeapons[Number(def)] = toPluginWeapon(item);
  }
  for (const [def, itemId] of Object.entries(loadout.equippedT)) {
    const item = itemById(itemId);
    if (item) result.tWeapons[Number(def)] = toPluginWeapon(item);
  }

  const knifeT = itemById(loadout.knifeT);
  if (knifeT) result.knives[2] = toPluginWeapon(knifeT);
  const knifeCT = itemById(loadout.knifeCT);
  if (knifeCT) result.knives[3] = toPluginWeapon(knifeCT);

  const glovesT = itemById(loadout.glovesT);
  if (glovesT) result.gloves[2] = toPluginWeapon(glovesT);
  const glovesCT = itemById(loadout.glovesCT);
  if (glovesCT) result.gloves[3] = toPluginWeapon(glovesCT);


  const agentT = itemById(loadout.agentT);
  if (agentT) result.agents[2] = toPluginWeapon(agentT);
  const agentCT = itemById(loadout.agentCT);
  if (agentCT) result.agents[3] = toPluginWeapon(agentCT);

  // Patches aren't currently bound to teams cleanly in PluginWeapon structure so we can just leave patches map empty or add if needed.

  return result;
}
