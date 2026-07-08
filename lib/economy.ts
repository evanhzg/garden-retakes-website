import "server-only";
import { CS2Economy, CS2_ITEMS, CS2Team, type CS2EconomyItem } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english";

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
  | "Heavy";

export const WEAPON_CATEGORY_ORDER: WeaponCategory[] = [
  "Rifles",
  "Snipers",
  "SMGs",
  "Pistols",
  "Heavy",
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
  };
  weaponByDef = new Map();

  for (const item of CS2Economy.itemsAsArray) {
    if (!item.isWeapon() || !item.base || item.def === undefined) continue;
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
      !item.isWeapon() ||
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
    });
  }
  skins.sort((a, b) => a.name.localeCompare(b.name));
  return skins;
}

export function searchStickers(query: string, limit = 80): StickerEntry[] {
  ensureLoaded();
  const q = query.toLowerCase().trim();
  const results: StickerEntry[] = [];
  for (const item of CS2Economy.getStickers()) {
    if (item.index === undefined) continue;
    const name = item.name.replace(/^Sticker \| /, "");
    if (q && !name.toLowerCase().includes(q)) continue;
    results.push({
      id: item.id,
      def: item.index,
      name,
      image: item.getImage(),
      rarity: item.rarity ?? "#b0c3d9",
      category: item.category ?? "",
    });
    if (results.length >= limit) break;
  }
  return results;
}
