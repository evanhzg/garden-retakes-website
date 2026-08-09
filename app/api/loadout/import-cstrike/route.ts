import { NextResponse } from "next/server";
import { CS2Inventory, CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english";
import { newId, Loadout, InventoryItem, emptyLoadout, M4A4, M4A1S, PlacedSticker } from "@/lib/inventory";

let economyLoaded = false;
function loadEconomy() {
  if (economyLoaded) return;
  CS2Economy.load({ items: CS2_ITEMS, language: english });
  economyLoaded = true;
}

export async function POST(request: Request) {
  try {
    loadEconomy();
    const { payload } = await request.json();
    if (!payload) return NextResponse.json({ error: "Missing payload" }, { status: 400 });

    let shareCode = payload;
    if (payload.includes("v4_") || payload.includes("share=")) {
      const match = payload.match(/(?:share=)?(v[0-9]+_[A-Za-z0-9+\/=]+)/);
      if (match) shareCode = match[1];
    } else if (payload.startsWith("http")) {
       const u = new URL(payload);
       shareCode = u.searchParams.get("share") || payload;
    }

    const invData = CS2Inventory.parse(shareCode, CS2Economy);
    if (!invData) {
      return NextResponse.json({ error: "Invalid cstrike inventory data" }, { status: 400 });
    }

    const loadout: Loadout = emptyLoadout("Imported from cstrike");
    const items: InventoryItem[] = [];
    let nextUid = 1;

    for (const [index, csItem] of Object.entries(invData.items)) {
      const economyItem = CS2Economy.getById(csItem.id);
      if (!economyItem) continue;

      if (!csItem.equipped && !csItem.equippedCT && !csItem.equippedT) {
         continue; // Only import equipped items for the loadout
      }

      let kind: "weapon" | "knife" | "gloves" | "agent" | "patch" | "charm" = "weapon";
      if (economyItem.isMelee()) kind = "knife";
      else if (economyItem.isGloves()) kind = "gloves";
      else if (economyItem.isAgent()) kind = "agent";
      else if (economyItem.isPatch()) kind = "patch";
      else if (economyItem.isKeychain()) kind = "charm";

      let weaponDef = economyItem.def;
      if (kind === "patch") weaponDef = economyItem.index ?? 0;
      if (kind === "charm") weaponDef = economyItem.id;
      
      const targetSides = [];
      if (csItem.equipped) targetSides.push("t", "ct");
      else {
         if (csItem.equippedT) targetSides.push("t");
         if (csItem.equippedCT) targetSides.push("ct");
      }

      const stickers: (PlacedSticker | null)[] = [];
      if (csItem.stickers) {
        for (const [slot, s] of Object.entries(csItem.stickers)) {
          const st = CS2Economy.getById(s.id);
          stickers[parseInt(slot)] = {
            def: st.index ?? 0,
            name: st.name.replace(/^Sticker \| /, ""),
            image: st.getImage(),
            slot: parseInt(slot),
            wear: s.wear ?? 0,
            x: s.x, y: s.y, rotation: s.rotation
          };
        }
      }
      
      let charm: PlacedSticker | null = null;
      if (csItem.keychains && Object.keys(csItem.keychains).length > 0) {
        const slot = Object.keys(csItem.keychains)[0];
        const c = csItem.keychains[slot];
        const ch = CS2Economy.getById(c.id);
        charm = {
            def: c.id,
            name: ch.name.replace(/^Charm \| /, ""),
            image: ch.getImage(),
            slot: parseInt(slot),
            wear: 0,
            x: c.x, y: c.y, rotation: c.z
        };
      }

      let weaponName = economyItem.name;
      if (economyItem.baseId) {
         weaponName = CS2Economy.getById(economyItem.baseId).name;
      } else if (economyItem.base) {
         weaponName = economyItem.name;
      }

      const invItem: InventoryItem = {
        id: newId(),
        uid: nextUid++,
        kind,
        weaponDef: weaponDef ?? 0,
        weaponName,
        team: "both",
        skinId: economyItem.id,
        skinName: economyItem.name,
        paint: economyItem.index ?? 0,
        image: economyItem.getImage(),
        rarity: economyItem.rarity ?? "",
        wear: csItem.wear ?? 0,
        seed: csItem.seed ?? 1,
        statTrak: csItem.statTrak !== undefined,
        nameTag: csItem.nameTag ?? "",
        stickers: Array.from({length: 5}, (_, i) => stickers[i] || null),
        charm,
        createdAt: Date.now(),
        source: "cstrike"
      };
      
      items.push(invItem);
      
      for (const side of targetSides) {
          if (kind === "knife") {
            if (side === "t") loadout.knifeT = invItem.id;
            else loadout.knifeCT = invItem.id;
          } else if (kind === "gloves") {
            if (side === "t") loadout.glovesT = invItem.id;
            else loadout.glovesCT = invItem.id;
          } else if (kind === "agent") {
            if (side === "t") loadout.agentT = invItem.id;
            else loadout.agentCT = invItem.id;
          } else if (kind === "patch") {
            if (!loadout.equippedPatchesT) loadout.equippedPatchesT = [];
            if (!loadout.equippedPatchesCT) loadout.equippedPatchesCT = [];
            if (side === "t") loadout.equippedPatchesT.push(invItem.id);
            else loadout.equippedPatchesCT.push(invItem.id);
          } else if (kind === "weapon" && weaponDef) {
            if (side === "t") loadout.equippedT[weaponDef] = invItem.id;
            else loadout.equippedCT[weaponDef] = invItem.id;
            if (weaponDef === M4A1S || weaponDef === M4A4) {
               if (side === "ct") loadout.preferredM4 = weaponDef;
            }
          }
      }
    }

    return NextResponse.json({ loadout, items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
