import "server-only";
import { NextResponse } from "next/server";
import { CS2Economy, CS2Team } from "@ianlucas/cs2-lib";
import { prisma } from "@/lib/db";
import { defaultStore, normaliseStore, type InventoryStore, type ItemKind, type Team } from "@/lib/inventory";
import { getSkinsForWeapon, getWeaponByDef, getWeaponCatalog, toGameAgentDef, toGameMusicKitDef } from "@/lib/economy";
import { rarityOf } from "@/lib/inventory";
import { WEAPON_DEFS, isSide, type CatalogPick, type GameIds, type Side } from "@/lib/re5ws";

// The server half of app/api/re5ws/*: the key check, the stored inventory, and
// the cs2-lib catalog that lib/re5ws.ts is kept apart from.

export const GAME_IDS: GameIds = { agentDef: toGameAgentDef, musicKitDef: toGameMusicKitDef };

/**
 * The plugin's request, or a response to send back instead. Same shared key as
 * the other plugin endpoints (INVSIM_API_KEY here, invsim_apikey on the server).
 */
export async function pluginRequest(request: Request): Promise<
  { body: Record<string, unknown>; steamId: bigint } | { response: NextResponse }
> {
  const secret = (process.env.INVSIM_API_KEY ?? "").trim();
  if (!secret) return { response: NextResponse.json({ ok: false, error: "INVSIM_API_KEY not configured" }, { status: 500 }) };
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { response: NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 }) };
  }
  if (typeof body.apiKey !== "string" || body.apiKey.trim() !== secret) {
    return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (typeof body.userId !== "string" || !/^\d{17}$/.test(body.userId)) {
    return { response: NextResponse.json({ ok: false, error: "userId required" }, { status: 400 }) };
  }
  return { body, steamId: BigInt(body.userId) };
}

export async function readStore(steamId: bigint): Promise<InventoryStore> {
  const row = await prisma.webInventory.findUnique({ where: { SteamId: steamId } });
  if (!row) return defaultStore();
  try {
    return normaliseStore(JSON.parse(row.Data) as InventoryStore);
  } catch {
    // Not overwritten from here: a store the site cannot read is the site's to fix.
    throw new Error("corrupt inventory");
  }
}

export async function writeStore(steamId: bigint, store: InventoryStore) {
  const data = JSON.stringify(store);
  await prisma.webInventory.upsert({
    where: { SteamId: steamId },
    create: { SteamId: steamId, Data: data },
    update: { Data: data },
  });
}

let economyReady = false;
function economy() {
  if (!economyReady) {
    getWeaponCatalog();   // loads CS2Economy the way lib/economy does
    economyReady = true;
  }
  return CS2Economy;
}

function teamOf(teams: CS2Team[] | undefined): Team {
  const t = (teams ?? []).includes(CS2Team.T), ct = (teams ?? []).includes(CS2Team.CT);
  return t && ct ? "both" : ct ? "ct" : t ? "t" : "both";
}

/** A catalog id as the manager can add it, or undefined. */
export function catalogPick(id: number): CatalogPick | undefined {
  let item;
  try {
    item = economy().getById(id);
  } catch {
    return undefined;
  }
  if (!item) return undefined;
  let kind: ItemKind;
  if (item.isAgent()) kind = "agent";
  else if (item.isMusicKit()) kind = "musickit";
  else if (item.isMelee()) kind = "knife";
  else if (item.isGloves()) kind = "gloves";
  else if (item.isWeapon()) kind = "weapon";
  else return undefined;

  if (kind === "weapon" && (item.def === undefined || !WEAPON_DEFS.has(item.def) || item.base)) return undefined;
  if ((kind === "knife" || kind === "gloves") && item.def === undefined) return undefined;
  if (kind === "gloves" && item.base) return undefined;   // the stock pair is the default, not an item

  const byId = kind === "agent" || kind === "musickit";
  const weaponDef = byId ? item.id : item.def!;
  const base = item.baseId !== undefined ? economy().getById(item.baseId) : undefined;
  return {
    kind,
    weaponDef,
    weaponName: byId ? item.name : (base?.name ?? getWeaponByDef(weaponDef)?.name ?? item.name),
    team: kind === "agent" ? teamOf(item.teams) : "both",
    skinId: item.id,
    skinName: item.name,
    paint: item.index ?? 0,
    image: item.getImage(),
    rarity: item.rarity ?? "#b0c3d9",
    wearMin: item.wearMin ?? 0,
  };
}

const tier = (hex?: string) => rarityOf(hex)?.tier ?? -1;

export type CatalogAnswer = {
  /** knife / glove types to choose from first: [def, name] */
  types?: [number, string][];
  /** [catalogId, name, rarityTier, gameDef, paint] */
  list?: [number, string, number, number, number][];
};

/** What the manager's "All skins" shows for a slot. */
export function catalogFor(slot: string, side: Side | "", type: number): CatalogAnswer | undefined {
  const cat = getWeaponCatalog();
  if (slot === "knife" || slot === "gloves") {
    const entries = slot === "knife" ? cat.Knives : cat.Gloves;
    if (!type) return { types: entries.map((e) => [e.def, e.name]) };
    const base = entries.find((e) => e.def === type);
    if (!base) return undefined;
    const list: CatalogAnswer["list"] = getSkinsForWeapon(type).map((s) => [s.id, s.name, tier(s.rarity), type, s.paint]);
    // A knife can be carried without a finish; gloves cannot.
    if (slot === "knife") list.unshift([base.id, base.name, tier(base.rarity ?? "#eb4b4b"), type, 0]);
    return { list };
  }
  if (slot === "agent") {
    if (!isSide(side)) return undefined;
    return {
      list: cat.Agents.filter((a) => a.team === side || a.team === "both")
        .map((a) => [a.id, a.name, tier(a.rarity), toGameAgentDef(a.def), 0]),
    };
  }
  if (slot === "music") {
    return { list: cat["Music Kits"].map((m) => [m.id, m.name, tier(m.rarity), toGameMusicKitDef(m.def), 0]) };
  }
  const def = Number(slot);
  if (!Number.isInteger(def) || !WEAPON_DEFS.has(def)) return undefined;
  return { list: getSkinsForWeapon(def).map((s) => [s.id, s.name, tier(s.rarity), def, s.paint]) };
}
