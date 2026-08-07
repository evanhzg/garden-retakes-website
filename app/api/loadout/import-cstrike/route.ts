import { NextResponse } from "next/server";
import { CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english";
import { newId, emptyLoadout, Loadout, defaultStickerSlots, PlacedSticker, InventoryItem, STICKER_SLOTS } from "@/lib/inventory";

let economyLoaded = false;

export async function POST(req: Request) {
  try {
    if (!economyLoaded) {
      CS2Economy.load({ items: CS2_ITEMS, language: english });
      economyLoaded = true;
    }
    const { payload } = await req.json();
    let data;
    try {
      const url = new URL(payload);
      const search = url.searchParams.get("inventory");
      data = search ? JSON.parse(decodeURIComponent(search)) : JSON.parse(payload);
    } catch {
      data = JSON.parse(payload);
    }

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "Invalid format: expected array" }, { status: 400 });
    }

    const loadout = emptyLoadout("Imported Loadout");
    loadout.equippedPatchesCT = [];
    loadout.equippedPatchesT = [];
    
    let uidCounter = Date.now();
    const items: InventoryItem[] = [];

    for (const i of data) {
      if (!i.id || !i.equipped) continue;
      const econItem = CS2Economy.getById(i.id);
      if (!econItem) continue;

      const itemKind = econItem.isAgent() ? "agent" : econItem.isPatch() ? "patch" : econItem.isKeychain() ? "charm" : econItem.isMelee() ? "knife" : econItem.isGloves() ? "gloves" : "weapon";
      
      const stickers: (PlacedSticker | null)[] = defaultStickerSlots();
      if (i.stickers) {
        for (const [slot, s] of Object.entries(i.stickers)) {
          const sIdx = Number(slot);
          if (sIdx >= 0 && sIdx < STICKER_SLOTS) {
            const stickerItem = CS2Economy.getById(s as number);
            if (stickerItem) {
              stickers[sIdx] = {
                def: stickerItem.index ?? 0,
                name: stickerItem.name,
                image: stickerItem.getImage(),
                slot: sIdx,
                wear: i.stickerswear?.[slot] ?? 0,
                x: 0,
                y: 0,
                rotation: i.stickersrotation?.[slot] ?? 0
              };
            }
          }
        }
      }

      const invItem: InventoryItem = {
        id: newId(),
        uid: uidCounter++,
        kind: itemKind as any,
        weaponDef: econItem.def ?? econItem.id, // For agents/charms
        weaponName: econItem.name,
        team: econItem.teams?.includes(3) && econItem.teams?.includes(2) ? "both" : econItem.teams?.includes(3) ? "ct" : "t",
        skinId: i.id,
        skinName: econItem.name,
        paint: econItem.index ?? 0,
        image: econItem.getImage(),
        rarity: econItem.rarity ?? "#b0c3d9",
        wear: i.wear ?? 0.02,
        seed: i.seed ?? 1,
        statTrak: i.stattrak !== undefined,
        nameTag: i.nametag ?? "",
        stickers,
        createdAt: Date.now()
      };

      items.push(invItem);

      if (i.equipped) {
        const isCT = i.equipped.includes(3) || i.equippedCT;
        const isT = i.equipped.includes(2) || i.equippedT;

        if (itemKind === "knife") {
          if (isCT) loadout.knifeCT = invItem.id;
          if (isT) loadout.knifeT = invItem.id;
        } else if (itemKind === "gloves") {
          if (isCT) loadout.glovesCT = invItem.id;
          if (isT) loadout.glovesT = invItem.id;
        } else if (itemKind === "agent") {
          if (isCT) loadout.agentCT = invItem.id;
          if (isT) loadout.agentT = invItem.id;
        } else if (itemKind === "patch") {
          if (isCT) loadout.equippedPatchesCT?.push(invItem.id);
          if (isT) loadout.equippedPatchesT?.push(invItem.id);
        } else if (itemKind === "weapon") {
          if (isCT) loadout.equippedCT[econItem.def ?? 0] = invItem.id;
          if (isT) loadout.equippedT[econItem.def ?? 0] = invItem.id;
        }
      }
    }

    return NextResponse.json({ success: true, loadout, items });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to parse: " + err.message }, { status: 400 });
  }
}
