/**
 * What a saved loadout must survive.
 *
 * Stickers were disappearing on reload, and the store was the first suspect —
 * it was not. `normaliseStore` runs on both the way out and the way back in
 * (`app/api/inventory/route.ts` calls it in GET *and* POST), so anything it
 * quietly drops is lost with no error anywhere. It turned out to keep
 * everything, and the real bug was upstream in the editor, which never handed
 * its result to the store at all.
 *
 * That is exactly why this exists: the round trip is the load-bearing
 * assumption the whole feature rests on, and nothing was checking it. If a
 * field is ever added to an item and not to whatever rebuilds one, this fails
 * instead of a player losing work.
 */
import {
  normaliseStore,
  defaultStickerSlots,
  charmSeed,
  type InventoryItem,
  type InventoryStore,
  type PlacedSticker,
} from "@/lib/inventory";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

/** The trip a loadout actually makes: POST -> LongText column -> GET. */
const roundTrip = (s: InventoryStore): InventoryStore =>
  normaliseStore(JSON.parse(JSON.stringify(normaliseStore(s))));

const sticker = (slot: number, extra: Partial<PlacedSticker> = {}): PlacedSticker => ({
  def: 6028,
  name: `Sticker ${slot}`,
  image: `https://example.invalid/${slot}.png`,
  slot,
  wear: 0,
  ...extra,
});

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "item-1",
  uid: 11,
  kind: "weapon",
  weaponDef: 7,
  weaponName: "AK-47",
  team: "t",
  skinId: 12345,
  skinName: "Redline",
  paint: 282,
  image: "https://example.invalid/ak.png",
  rarity: "#d32ce6",
  wear: 0.15,
  seed: 421,
  statTrak: true,
  nameTag: "",
  stickers: defaultStickerSlots(),
  createdAt: 1,
  ...over,
});

const storeWith = (i: InventoryItem): InventoryStore => ({
  items: [i],
  loadouts: [
    {
      id: "lo-1",
      name: "Loadout 1",
      equippedCT: {},
      equippedT: { "7": i.id },
    },
  ],
  activeLoadoutId: "lo-1",
  nextUid: 12,
});

// ---- stickers, including the fifth slot -----------------------------------

const stickers: (PlacedSticker | null)[] = [
  sticker(0),
  sticker(1, { wear: 0.6, rotation: 42, x: 0.028, y: -0.028 }),
  null,
  null,
  // CS2 has five sticker slots. The fifth is the one that has been reported
  // missing before, so it is named here rather than left to a loop.
  sticker(4, { def: 76 }),
];

const afterStickers = roundTrip(storeWith(item({ stickers })))
  .items[0];

check("all five sticker slots survive", afterStickers.stickers.length === 5,
  `got ${afterStickers.stickers.length}`);
check("the fifth slot keeps its sticker", afterStickers.stickers[4]?.def === 76,
  JSON.stringify(afterStickers.stickers[4]));
check("an empty slot stays empty, not undefined", afterStickers.stickers[2] === null);
check("placement survives", afterStickers.stickers[1]?.x === 0.028 && afterStickers.stickers[1]?.y === -0.028,
  JSON.stringify(afterStickers.stickers[1]));
check("rotation survives", afterStickers.stickers[1]?.rotation === 42);
check("sticker wear survives", afterStickers.stickers[1]?.wear === 0.6);

// ---- the charm ------------------------------------------------------------

const charm: PlacedSticker = {
  def: 20,
  name: "Baby Karat T",
  image: "https://example.invalid/charm.png",
  slot: 5,
  wear: 0,
  x: 0.1,
  y: -0.2,
  z: 0.3,
};

const afterCharm = roundTrip(storeWith(item({ charm }))).items[0];

check("the charm survives at all", !!afterCharm.charm, JSON.stringify(afterCharm.charm));
check("charm x/y survive", afterCharm.charm?.x === 0.1 && afterCharm.charm?.y === -0.2);
check("charm z survives — the axis that used to ride in `rotation`", afterCharm.charm?.z === 0.3,
  JSON.stringify(afterCharm.charm));

// A charm that has never been placed must stay unplaced. Absent axes are how
// "put it where the game puts an unplaced one" is expressed, so inventing a
// zero here would silently move every existing charm.
const unplaced = roundTrip(storeWith(item({ charm: { ...charm, x: undefined, y: undefined, z: undefined } }))).items[0];
check("an unplaced charm stays unplaced", unplaced.charm?.x === undefined && unplaced.charm?.z === undefined,
  JSON.stringify(unplaced.charm));

// ---- the rest of the item -------------------------------------------------

const full = roundTrip(storeWith(item({ stickers, charm, nameTag: "ta grand mere" }))).items[0];
check("wear survives", full.wear === 0.15);
check("seed survives", full.seed === 421);
check("StatTrak survives", full.statTrak === true);
check("name tag survives", full.nameTag === "ta grand mere");
check("uid survives — StatTrak counters key off it", full.uid === 11);
check("rarity survives", full.rarity === "#d32ce6");

// ---- the charm's pose -----------------------------------------------------

// Derived from uid, so it has to be stable across a round trip: a charm that
// re-poses itself every time the plugin re-reads the loadout is the bug this
// replaced.
check("charm seed is stable across the round trip", charmSeed(full) === charmSeed(item({ uid: 11 })));
check("charm seed is at least 1 — the game's minimum", charmSeed(full) >= 1, String(charmSeed(full)));
check("two items do not share a pose", charmSeed(item({ uid: 11 })) !== charmSeed(item({ uid: 12 })));

// ---- what normaliseStore is allowed to invent ------------------------------

// An item saved before stickers existed has none. It must come back with five
// empty slots rather than undefined, or the editor indexes off nothing.
const legacy = roundTrip(storeWith(item({ stickers: undefined as unknown as (PlacedSticker | null)[] }))).items[0];
check("a store with no stickers array gets five empty slots", legacy.stickers.length === 5);
check("and they are all empty", legacy.stickers.every((s) => s === null));

process.exit(fails === 0 ? 0 : 1);
