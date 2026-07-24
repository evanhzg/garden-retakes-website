import {
  InventoryItem,
  InventoryStore,
  Loadout,
  newId,
  type Side,
} from "@/lib/inventory";

// Loadout sharing: a self-contained snapshot of ONE loadout (its structure +
// the items it references), addressable by a short lowercase key. Borrow it on
// the website (import into your store) or in-game with /borrow <key>.

export type LoadoutSnapshot = {
  name: string;
  loadout: Loadout;
  items: InventoryItem[];
};

// Lowercase, no caps, ambiguity-free alphabet (no 0/o/1/l/i) — short keys stay
// easy to read out loud and type in chat.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function generateKey(length = 6): string {
  let key = "";
  for (let i = 0; i < length; i += 1) {
    key += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return key;
}

/** All item ids a loadout references (both sides + knife/glove slots). */
function referencedItemIds(loadout: Loadout): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.values(loadout.equippedCT)) ids.add(id);
  for (const id of Object.values(loadout.equippedT)) ids.add(id);
  for (const id of [loadout.knifeCT, loadout.knifeT, loadout.glovesCT, loadout.glovesT]) {
    if (id) ids.add(id);
  }
  return ids;
}

/** Build a self-contained snapshot of one loadout from a store. */
export function buildSnapshot(store: InventoryStore, loadoutId: string): LoadoutSnapshot | null {
  const loadout = store.loadouts.find((l) => l.id === loadoutId);
  if (!loadout) return null;
  const ids = referencedItemIds(loadout);
  const items = store.items.filter((i) => ids.has(i.id));
  return { name: loadout.name, loadout, items };
}

/**
 * Merge a snapshot into a store: the items are re-created with fresh ids + uids
 * (so they never collide with the borrower's own items), the loadout is added
 * with remapped references and made active. Returns a NEW store.
 */
export function importSnapshot(store: InventoryStore, snapshot: LoadoutSnapshot): InventoryStore {
  let nextUid = store.nextUid;
  const idMap = new Map<string, string>();
  const newItems: InventoryItem[] = snapshot.items.map((item) => {
    const freshId = newId();
    idMap.set(item.id, freshId);
    return { ...item, id: freshId, uid: nextUid++ };
  });

  const remap = (map: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [def, oldId] of Object.entries(map)) {
      const mapped = idMap.get(oldId);
      if (mapped) out[def] = mapped;
    }
    return out;
  };
  const slot = (id?: string) => (id ? idMap.get(id) : undefined);

  // Avoid a duplicate name colliding with an existing loadout.
  let name = snapshot.name || "Borrowed loadout";
  if (store.loadouts.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
    name = `${name} (borrowed)`;
  }

  const loadout: Loadout = {
    id: newId(),
    name,
    equippedCT: remap(snapshot.loadout.equippedCT),
    equippedT: remap(snapshot.loadout.equippedT),
    knifeCT: slot(snapshot.loadout.knifeCT),
    knifeT: slot(snapshot.loadout.knifeT),
    glovesCT: slot(snapshot.loadout.glovesCT),
    glovesT: slot(snapshot.loadout.glovesT),
  };

  return {
    ...store,
    items: [...newItems, ...store.items],
    loadouts: [...store.loadouts, loadout],
    activeLoadoutId: loadout.id,
    nextUid,
  };
}

/** Small preview for the Featured/borrow UI (images + item count). */
export function snapshotPreview(snapshot: LoadoutSnapshot): { images: string[]; count: number } {
  const images = snapshot.items.slice(0, 5).map((i) => i.image).filter(Boolean);
  return { images, count: snapshot.items.length };
}

export const SIDES: Side[] = ["t", "ct"];
