// Resolve which weapon a workshop skin is for.
//
// Both consumers key on the CS2 item definition index: the InventorySimulator
// plugin stores `def` on every InventoryItem, and the site's /api/skins is
// queried by `def`. Workshop skins tag themselves with the weapon's display
// name ("Glock-18", "AK-47"), and the title is conventionally
// "<Weapon> | <Skin>" — so between the two we can almost always resolve it.
//
// The def table is read live from @ianlucas/cs2-lib (already a dependency of
// this site, and the same library the plugin's item ids come from) rather than
// hardcoded, so it can't drift when Valve adds a weapon.

let cache = null;

/** `[{ name, def, model }]` for every base weapon, knife and glove. */
async function loadWeapons() {
  if (cache) return cache;

  // cs2-lib is ESM-only; this module is CommonJS, hence the dynamic import.
  const { CS2Economy, CS2_ITEMS } = await import("@ianlucas/cs2-lib");
  const { english } = await import("@ianlucas/cs2-lib/translations/english");
  CS2Economy.load({ items: CS2_ITEMS, language: english });

  const weapons = [];
  for (const item of CS2Economy.itemsAsArray) {
    if (!item.base || item.def === undefined) continue;
    if (!(item.isWeapon() || item.isMelee() || item.isGloves())) continue;
    weapons.push({ name: item.name, def: item.def, model: item.model ?? null });
  }
  cache = weapons;
  return weapons;
}

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Best-effort weapon match from the workshop tags and title.
 *
 * Tags win: they are a controlled vocabulary that already matches cs2-lib's
 * names. The title ("Glock-18 | Magic Touch") is the fallback, matched on the
 * part before the pipe so a skin name mentioning another gun can't mislead it.
 *
 * @returns {{ def:number, name:string, model:string|null, via:string }|null}
 */
async function resolveWeapon({ tags = [], title = "" } = {}) {
  const weapons = await loadWeapons();
  const byNorm = new Map(weapons.map((w) => [normalize(w.name), w]));

  for (const tag of tags) {
    const hit = byNorm.get(normalize(tag));
    if (hit) return { ...hit, via: `tag "${tag}"` };
  }

  const head = title.includes("|") ? title.split("|")[0] : title;
  const headNorm = normalize(head);
  if (headNorm) {
    const exact = byNorm.get(headNorm);
    if (exact) return { ...exact, via: "title" };

    // "StatTrak™ AK-47" and similar prefixes: fall back to a contains match,
    // longest name first so "M4A1-S" beats "M4A4" on an ambiguous string.
    const sorted = [...weapons].sort((a, b) => b.name.length - a.name.length);
    const loose = sorted.find((w) => headNorm.includes(normalize(w.name)));
    if (loose) return { ...loose, via: "title (partial)" };
  }

  return null;
}

/** The tag Valve uses for skins, so we can warn on non-finish items. */
function looksLikeWeaponFinish(tags = []) {
  return tags.some((t) => /weapon finish|custom paint job/i.test(t));
}

module.exports = { loadWeapons, resolveWeapon, looksLikeWeaponFinish };
