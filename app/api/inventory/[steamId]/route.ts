import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findLoadout, normaliseStore, type InventoryStore } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export type PublicLoadoutSlot = {
  label: string;
  image: string | null;
  hasSkin: boolean;
  skinName?: string;
};

export type PublicLoadout = {
  name: string;
  /** Weapon slots for T side: [AK, AWP, Deagle, Glock] */
  t: PublicLoadoutSlot[];
  /** Weapon slots for CT side: [M4, AWP, Deagle, USP] */
  ct: PublicLoadoutSlot[];
  knife: { t: PublicLoadoutSlot; ct: PublicLoadoutSlot };
  gloves: { t: PublicLoadoutSlot; ct: PublicLoadoutSlot };
};

// Weapon defs matching ProfileShowcase
const T_SLOTS = [
  { def: 7, label: "AK-47" },
  { def: 9, label: "AWP" },
  { def: 1, label: "Desert Eagle" },
  { def: 4, label: "Glock-18" },
];
const CT_SLOTS = [
  { def: 16, label: "M4A4" }, // will swap to preferredM4
  { def: 9, label: "AWP" },
  { def: 1, label: "Desert Eagle" },
  { def: 61, label: "USP-S" },
];
const M4A1S = 60;

/**
 * GET /api/inventory/[steamId]
 * Public read — returns the active loadout's weapon/knife/gloves images.
 */
export async function GET(
  _req: Request,
  { params }: { params: { steamId: string } }
) {
  const { steamId } = params;
  if (!/^\d{15,20}$/.test(steamId)) {
    return NextResponse.json({ error: "invalid steamId" }, { status: 400 });
  }

  const row = await prisma.webInventory.findUnique({
    where: { SteamId: BigInt(steamId) },
  });

  if (!row) return NextResponse.json(null);

  let store: InventoryStore;
  try {
    store = normaliseStore(JSON.parse(row.Data) as InventoryStore);
  } catch {
    return NextResponse.json(null);
  }

  const loadout = findLoadout(store);
  if (!loadout) return NextResponse.json(null);

  const itemById = (id?: string) =>
    id ? store.items.find((i) => i.id === id) : undefined;

  const weaponSlot = (def: number, equippedMap: Record<string, string>): PublicLoadoutSlot => {
    const item = itemById(equippedMap[def]);
    if (item) return { label: String(def), image: item.image, hasSkin: true, skinName: item.skinName };
    return { label: String(def), image: null, hasSkin: false };
  };

  const kgSlot = (itemId?: string, label = ""): PublicLoadoutSlot => {
    const item = itemById(itemId);
    if (item) return { label, image: item.image, hasSkin: true, skinName: item.skinName };
    return { label, image: null, hasSkin: false };
  };

  const preferredM4 = loadout.preferredM4 ?? 16;

  const result: PublicLoadout = {
    name: loadout.name,
    t: T_SLOTS.map((s) => {
      const slot = weaponSlot(s.def, loadout.equippedT);
      slot.label = s.label;
      return slot;
    }),
    ct: CT_SLOTS.map((s) => {
      const def = s.def === 16 ? preferredM4 : s.def;
      const label = s.def === 16 ? (preferredM4 === M4A1S ? "M4A1-S" : "M4A4") : s.label;
      const slot = weaponSlot(def, loadout.equippedCT);
      slot.label = label;
      return slot;
    }),
    knife: {
      t: kgSlot(loadout.knifeT, "Knife"),
      ct: kgSlot(loadout.knifeCT, "Knife"),
    },
    gloves: {
      t: kgSlot(loadout.glovesT, "Gloves"),
      ct: kgSlot(loadout.glovesCT, "Gloves"),
    },
  };

  return NextResponse.json(result);
}
