import "server-only";
import { CS2Economy, CS2_ITEMS, CS2Team, type CS2EconomyItem } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english";
import { CS2_DEF, UTILITY_DEF } from "@/lib/retakeLoadout";

// The item catalog is the exact one ianlucas's simulator + plugin use, so the
// numeric ids we serve (weapon `def`, paint `index`, sticker kit `index`) match
// what the CS2 plugin expects. Images are the simulator's hashed assets; the host
// is configurable so it can be self-hosted later.
// cs2-lib's own CDN serves the hashed webp assets (image/webp + CORS). The
// jsdelivr mirror of github.com/ianlucas/cs2-lib-assets is a drop-in alternative.
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "https://cdn.cstrike.app";

export type WeaponCategory =
  | "Pistols"
  | "SMGs"
  | "Rifles"
  | "Snipers"
  | "Heavy"
  | "Knives"
  | "Gloves"
  | "Agents"
  | "Patches"
  | "Charms"
  | "Music Kits";

export const WEAPON_CATEGORY_ORDER: WeaponCategory[] = [
  "Rifles",
  "Snipers",
  "SMGs",
  "Pistols",
  "Heavy",
  "Knives",
  "Gloves",
  "Agents",
  "Patches",
  "Charms",
  "Music Kits"
];

export type Team = "ct" | "t" | "both";

export type WeaponEntry = {
  /** cs2-lib item id of the base weapon. */
  id: number;
  /** In-game weapon definition index (plugin `def`). */
  def: number;
  name: string;
  model: string;
  image: string;
  category: WeaponCategory;
  team: Team;
  rarity?: string;
};

export type SkinEntry = {
  /** cs2-lib item id of this skin. */
  id: number;
  /** Weapon definition index this paint belongs to. */
  def: number;
  /** Paint kit index (plugin `paint`). */
  paint: number;
  name: string;
  image: string;
  rarity: string;
  /** Collection / case name (for grouping & filtering). */
  collection: string;
};

export type StickerEntry = {
  /** cs2-lib item id. */
  id: number;
  /** Sticker kit index (plugin sticker `def`). */
  def: number;
  name: string;
  image: string;
  rarity: string;
  category: string;
};

let loaded = false;
let weaponsByCategory: Record<WeaponCategory, WeaponEntry[]>;
let weaponByDef: Map<number, WeaponEntry>;

function teamOf(item: CS2EconomyItem): Team {
  const teams = item.teams ?? [];
  const hasT = teams.includes(CS2Team.T);
  const hasCt = teams.includes(CS2Team.CT);
  if (hasT && hasCt) return "both";
  if (hasCt) return "ct";
  return "t";
}

function categoryOf(item: CS2EconomyItem): WeaponCategory | null {
  if (item.isPistol()) return "Pistols";
  if (item.isSMG()) return "SMGs";
  if (item.isSniperRifle()) return "Snipers";
  if (item.isRifle()) return "Rifles";
  if (item.isHeavy() || item.isMachinegun()) return "Heavy";
  return null;
}

function ensureLoaded() {
  if (loaded) return;

  CS2Economy.load({
    assetsBaseUrl: ASSETS_BASE_URL,
    items: CS2_ITEMS,
    language: english,
  });

  weaponsByCategory = {
    Pistols: [],
    SMGs: [],
    Rifles: [],
    Snipers: [],
    Heavy: [],
    Knives: [],
    Gloves: [],
    Agents: [],
    Patches: [],
    Charms: [],
    "Music Kits": [],
  };
  weaponByDef = new Map();

  for (const item of CS2Economy.itemsAsArray) {
    // Knives & gloves live outside isWeapon(); the stock knives/gloves have
    // no paints, so skip them (nothing to equip).
    if (item.isMelee() || item.isGloves()) {
      if (!item.base || item.def === undefined) continue;
      const isStock =
        item.def === 42 || item.def === 59 || item.def === 5028 || item.free === true;
      if (isStock) continue;
      const entry: WeaponEntry = {
        id: item.id,
        def: item.def,
        name: item.name,
        model: item.model ?? "",
        image: item.getImage(),
        category: item.isMelee() ? "Knives" : "Gloves",
        team: teamOf(item),
      };
      weaponsByCategory[entry.category].push(entry);
      weaponByDef.set(item.def, entry);
      continue;
    }

    
    if (item.isAgent()) {
      const entry: WeaponEntry = { id: item.id, def: item.id, name: item.name, model: item.model ?? "", image: item.getImage(), category: "Agents", team: teamOf(item), rarity: item.rarity ?? "#b0c3d9" };
      weaponsByCategory["Agents"].push(entry);
      weaponByDef.set(item.id, entry);
      continue;
    }
    if (item.isPatch()) {
      const entry: WeaponEntry = { id: item.id, def: item.index ?? 0, name: item.name, model: "", image: item.getImage(), category: "Patches", team: "both", rarity: item.rarity ?? "#b0c3d9" };
      weaponsByCategory["Patches"].push(entry);
      weaponByDef.set(item.index ?? 0, entry);
      continue;
    }
    if (item.isKeychain()) {
      const entry: WeaponEntry = { id: item.id, def: item.id, name: item.name, model: "", image: item.getImage(), category: "Charms", team: "both", rarity: item.rarity ?? "#b0c3d9" };
      weaponsByCategory["Charms"].push(entry);
      weaponByDef.set(item.id, entry);
      continue;
    }
    if (item.isMusicKit()) {
      const entry: WeaponEntry = { id: item.id, def: item.id, name: item.name, model: "", image: item.getImage(), category: "Music Kits", team: "both", rarity: item.rarity ?? "#b0c3d9" };
      weaponsByCategory["Music Kits"].push(entry);
      weaponByDef.set(item.id, entry);
      continue;
    }

    if (!item.base || item.def === undefined) continue;
    if (!item.isWeapon()) continue;
    const category = categoryOf(item);
    if (!category) continue;
    const entry: WeaponEntry = {
      id: item.id,
      def: item.def,
      name: item.name,
      model: item.model ?? "",
      image: item.getImage(),
      category,
      team: teamOf(item),
    };
    weaponsByCategory[category].push(entry);
    weaponByDef.set(item.def, entry);
  }

  for (const category of WEAPON_CATEGORY_ORDER) {
    weaponsByCategory[category].sort((a, b) => a.name.localeCompare(b.name));
  }

  loaded = true;
}

export function getWeaponCatalog(): Record<WeaponCategory, WeaponEntry[]> {
  ensureLoaded();
  return weaponsByCategory;
}

export function getWeaponByDef(def: number): WeaponEntry | undefined {
  ensureLoaded();
  return weaponByDef.get(def);
}

export function getSkinsForWeapon(def: number): SkinEntry[] {
  ensureLoaded();
  const skins: SkinEntry[] = [];
  for (const item of CS2Economy.itemsAsArray) {
    if (
      item.isAgent() || item.isPatch() || item.isKeychain()
    ) {
      if ((item.id === def && item.isAgent()) || (item.index === def && item.isPatch()) || (item.id === def && item.isKeychain())) {
        skins.push({
          id: item.id,
          def,
          paint: 0,
          name: item.name,
          image: item.getImage(),
          rarity: item.rarity ?? "#b0c3d9",
          collection: item.collectionName ?? "",
        });
      }
      continue;
    }

    if (
      (!item.isWeapon() && !item.isMelee() && !item.isGloves()) ||
      item.base ||
      item.def !== def ||
      item.index === undefined
    ) {
      continue;
    }
    skins.push({
      id: item.id,
      def,
      paint: item.index,
      name: item.name,
      image: item.getImage(),
      rarity: item.rarity ?? "#b0c3d9",
      collection: item.collectionName ?? "",
    });
  }
  skins.sort((a, b) => a.name.localeCompare(b.name));
  return skins;
}

export function searchStickers(query: string, limit = 80, kind: "sticker" | "patch" | "charm" = "sticker"): StickerEntry[] {
  ensureLoaded();
  const q = query.toLowerCase().trim();
  const results: StickerEntry[] = [];
  
  const items = kind === "patch" ? CS2Economy.itemsAsArray.filter(i => i.isPatch()) : 
                kind === "charm" ? CS2Economy.itemsAsArray.filter(i => i.isKeychain()) : 
                CS2Economy.getStickers();
                
  for (const item of items) {
    if (item.index === undefined) continue;
    const name = item.name.replace(/^(Sticker \| |Patch \| |Charm \| )/, "");
    if (q && !name.toLowerCase().includes(q)) continue;
    results.push({
      id: item.id,
      def: item.index ?? 0,
      name,
      image: item.getImage(),
      rarity: item.rarity ?? "#b0c3d9",
      category: item.category ?? "",
    });
    if (limit > 0 && results.length >= limit) break;
  }
  return results;
}

export function searchPatches(query: string, limit = 80): StickerEntry[] {
  ensureLoaded();
  const q = query.toLowerCase().trim();
  const results: StickerEntry[] = [];
  for (const item of CS2Economy.itemsAsArray) {
    if (!item.isPatch()) continue;
    const name = item.name.replace(/^Patch \| /, "");
    if (q && !name.toLowerCase().includes(q)) continue;
    results.push({
      id: item.id,
      def: item.index ?? 0,
      name,
      image: item.getImage(),
      rarity: item.rarity ?? "#b0c3d9",
      category: item.category ?? "",
    });
    if (limit > 0 && results.length >= limit) break;
  }
  return results;
}

// ------------------------------------------------------------ loadout icons

/**
 * Icon URLs for the retakes loadout page, keyed by the ids that page speaks.
 *
 * Built here rather than in the component because this is where the catalog
 * lives, and resolved once on the server so the page ships with its icons
 * instead of asking a third party for them at render time. The previous version
 * guessed at filenames in an unaffiliated GitHub repo — every gun whose guess
 * missed (MP5-SD, PP-Bizon, CZ75-Auto, the R8, Sawed-Off, SG 553, the Dualies…)
 * rendered as a blank square, which is the bug this fixes.
 */
export type LoadoutIcons = {
  /** Allocator CsItem id → image URL. */
  weapons: Record<number, string>;
  /** Side → utility id → image URL. */
  utility: Record<"T" | "CT", Record<string, string>>;
};

export function getLoadoutIcons(): LoadoutIcons {
  ensureLoaded();

  const byDef = new Map<number, CS2EconomyItem>();
  for (const item of CS2Economy.itemsAsArray) {
    if (!item.base || item.def === undefined) continue;
    // Base items are the un-skinned models, which is exactly the plain icon a
    // preference picker wants. First one wins: `base` is unique per def.
    if (!byDef.has(item.def)) byDef.set(item.def, item);
  }

  const imageFor = (def: number) => byDef.get(def)?.getImage();

  const weapons: Record<number, string> = {};
  for (const [itemId, def] of Object.entries(CS2_DEF)) {
    const image = imageFor(def);
    if (image) weapons[Number(itemId)] = image;
  }

  const utility: LoadoutIcons["utility"] = { T: {}, CT: {} };
  for (const side of ["T", "CT"] as const) {
    for (const [id, def] of Object.entries(UTILITY_DEF[side])) {
      const image = imageFor(def);
      if (image) utility[side][id] = image;
    }
  }

  return { weapons, utility };
}

// ---------------------------------------------------------------- game ids
//
// The website and the game do not agree on what a "def" is, and they cannot be
// made to: this catalog keys everything a player has already saved by cs2-lib's
// item id, so changing those numbers would orphan every stored loadout. The
// translation therefore happens once, at the edge, when a loadout is serialised
// for the plugin.
//
// What the game wants, per the econ attributes the plugin writes:
//
//   agent              item definition index   (cs2-lib `def`,   e.g. 5105)
//   sticker / patch    sticker-kit index       (cs2-lib `index`, e.g. 4550)
//   charm (keychain)   keychain definition     (cs2-lib `index`, e.g. 1)
//
// Two of those were being sent as cs2-lib item ids (8620 for an agent, 13113
// for a charm), which are not valid values for those attributes — so the agent
// silently kept the default model and the charm never appeared on the gun.

type IdMaps = {
  agentDefById: Map<number, number>;
  agentDefs: Set<number>;
  keychainIndexById: Map<number, number>;
  keychainIndexes: Set<number>;
  stickerIndexById: Map<number, number>;
  stickerIndexes: Set<number>;
  musicKitIndexById: Map<number, number>;
  musicKitIndexes: Set<number>;
};

let idMaps: IdMaps | null = null;

function ensureIdMaps(): IdMaps {
  if (idMaps) return idMaps;
  ensureLoaded();

  const maps: IdMaps = {
    agentDefById: new Map(),
    agentDefs: new Set(),
    keychainIndexById: new Map(),
    keychainIndexes: new Set(),
    stickerIndexById: new Map(),
    stickerIndexes: new Set(),
    musicKitIndexById: new Map(),
    musicKitIndexes: new Set(),
  };

  for (const item of CS2Economy.itemsAsArray) {
    if (item.isMusicKit()) {
      if (item.index !== undefined) {
        maps.musicKitIndexById.set(item.id, item.index);
        maps.musicKitIndexes.add(item.index);
      }
      continue;
    }
    if (item.isAgent()) {
      if (item.def !== undefined) {
        maps.agentDefById.set(item.id, item.def);
        maps.agentDefs.add(item.def);
      }
      continue;
    }
    if (item.isKeychain()) {
      if (item.index !== undefined) {
        maps.keychainIndexById.set(item.id, item.index);
        maps.keychainIndexes.add(item.index);
      }
      continue;
    }
    // Patches live in the same sticker-kit table as stickers and are applied
    // through the same `sticker slot N id` attribute, so one map covers both.
    if (item.isPatch() || item.isSticker()) {
      if (item.index !== undefined) {
        maps.stickerIndexById.set(item.id, item.index);
        maps.stickerIndexes.add(item.index);
      }
    }
  }

  idMaps = maps;
  return maps;
}

/**
 * Translate one stored value into the id the game expects.
 *
 * Deliberately forgiving in both directions. A value that is already a valid
 * game id is left alone, so a loadout saved after this fix is not re-translated
 * into nonsense; a value that is a cs2-lib item id is converted; anything else
 * is passed through untouched rather than dropped, because silently removing a
 * player's agent is worse than sending an id the plugin will ignore.
 */
function translate(
  value: number,
  byId: Map<number, number>,
  valid: Set<number>
): number {
  if (valid.has(value)) return value;
  return byId.get(value) ?? value;
}

/**
 * Put a wear value inside the range its skin actually allows.
 *
 * Every skin has a wearMin and a wearMax — a Factory New-only finish might start
 * at 0.06, not 0 — and cs2-lib asserts on anything outside them. Its own
 * accessor is `wear ?? wearMin ?? 0`, so an absent wear means *the minimum for
 * that skin*, never zero.
 *
 * The cstrike importer stored `?? 0`, which is out of range for most finishes,
 * and the game is then asked to paint a weapon at a wear its material has no
 * variant for. Clamping here rather than only fixing the importer is deliberate:
 * it repairs inventories already saved, without anybody re-importing.
 *
 * Returns the wear unchanged for anything that has no wear at all (vanilla
 * finishes, agents, music kits) — there is nothing to clamp to.
 */
export function clampWear(skinId: number, wear: number): number {
  ensureLoaded();
  const item = CS2Economy.items.get(skinId);
  if (!item?.hasWear()) return wear;

  const min = item.wearMin ?? 0;
  const max = item.wearMax ?? 1;
  if (!Number.isFinite(wear)) return min;
  return Math.min(max, Math.max(min, wear));
}

/**
 * Drop sticker and charm placements the game cannot use.
 *
 * A placement offset is in the game's own units, roughly -0.6..0.6 depending on
 * the weapon, and cs2-lib asserts against each skin's own bounds. The website's
 * editor stores something else entirely: x and y as a percentage of the 2D
 * preview stage, which is what the field is documented as and what it is drawn
 * with. Those two have been going down the same wire — a sticker dragged on the
 * site arrives in game as x=24, y=58 against a range of x[-0.57, 0.49] — which
 * is exactly what "stickers randomly placed on the weapon" is.
 *
 * Out-of-range values are dropped rather than clamped. Clamping 58 to 0.34 is
 * still the wrong place, just a legal one; dropping it lets the game centre the
 * sticker in its slot, which is where it belongs far more often than an edge.
 * Imported items are unaffected — cs2-lib gives those real offsets and they
 * validate.
 *
 * The editor storing game-space coordinates is the real fix and a bigger one.
 * Until then this is the difference between stickers being wrong and stickers
 * being scattered.
 */
export function sanitisePlacement(
  skinId: number,
  placement: { x?: number; y?: number; rotation?: number },
  kind: "sticker" | "charm"
): void {
  ensureLoaded();
  const item = CS2Economy.items.get(skinId);
  if (!item) return;

  const [xMin, xMax, yMin, yMax] = kind === "sticker"
    ? [item.getMinimumStickerOffsetX(), item.getMaximumStickerOffsetX(),
       item.getMinimumStickerOffsetY(), item.getMaximumStickerOffsetY()]
    : [item.getMinimumKeychainOffsetX(), item.getMaximumKeychainOffsetX(),
       item.getMinimumKeychainOffsetY(), item.getMaximumKeychainOffsetY()];

  const outside = (v: number | undefined, min?: number, max?: number) =>
    v !== undefined && (!Number.isFinite(v) || (min !== undefined && v < min) || (max !== undefined && v > max));

  if (outside(placement.x, xMin, xMax)) placement.x = undefined;
  if (outside(placement.y, yMin, yMax)) placement.y = undefined;

  // The game takes -180..180. The editor's rotation happens to share that range,
  // so this only catches something genuinely broken.
  if (placement.rotation !== undefined
      && (!Number.isFinite(placement.rotation) || Math.abs(placement.rotation) > 180)) {
    placement.rotation = undefined;
  }
}

export const toGameAgentDef = (value: number): number => {
  const maps = ensureIdMaps();
  return translate(value, maps.agentDefById, maps.agentDefs);
};

/**
 * A safety net rather than a fix: the sticker and patch endpoints already emit
 * kit indexes, so every stored value is valid and passes straight through. It
 * exists so all three families go through the same door, and so a sticker saved
 * by some future code path that got this wrong is still recoverable.
 */
export const toGameStickerDef = (value: number): number => {
  const maps = ensureIdMaps();
  return translate(value, maps.stickerIndexById, maps.stickerIndexes);
};

export const toGameKeychainDef = (value: number): number => {
  const maps = ensureIdMaps();
  return translate(value, maps.keychainIndexById, maps.keychainIndexes);
};

/**
 * Music kits are addressed by their kit number — the small one, 1, 3, 4… — and
 * not by the cs2-lib item id or by the shared `def` every music kit has in
 * common. The plugin assigns it straight to `InventoryServices.MusicID`, so the
 * wrong number here is silently no music rather than an error.
 */
export const toGameMusicKitDef = (value: number): number => {
  const maps = ensureIdMaps();
  return translate(value, maps.musicKitIndexById, maps.musicKitIndexes);
};

export function searchCharms(query: string, limit = 80): StickerEntry[] {
  ensureLoaded();
  const q = query.toLowerCase().trim();
  const results: StickerEntry[] = [];
  for (const item of CS2Economy.itemsAsArray) {
    if (!item.isKeychain()) continue;
    const name = item.name.replace(/^Charm \| /, "");
    if (q && !name.toLowerCase().includes(q)) continue;
    results.push({
      id: item.id,
      def: item.id, // Charms use item.id as def for indexing
      name,
      image: item.getImage(),
      rarity: item.rarity ?? "#b0c3d9",
      category: item.category ?? "",
    });
    if (limit > 0 && results.length >= limit) break;
  }
  return results;
}
