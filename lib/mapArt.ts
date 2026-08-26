/**
 * Where a map's picture comes from.
 *
 * Deliberately import-free, like the other small shared rules in lib/. Three
 * sources in order, because each covers what the one before it cannot:
 *
 *   1. Whatever the maps catalog stored — for a workshop map that is its Steam
 *      preview image, and it is the only source that knows about it at all.
 *   2. /maps/<name>.webp, which the repository ships for the stock pool. A
 *      stock map that nobody has registered in the catalog still has a picture.
 *   3. Nothing, and the caller draws a blank tile. A map with no art is normal
 *      the day it is added and must not look like an error.
 */

/** Stock maps with a shipped picture in public/maps. */
const SHIPPED = new Set([
  "de_ancient",
  "de_anubis",
  "de_cache",
  "de_dust2",
  "de_inferno",
  "de_mirage",
  "de_nuke",
  "de_overpass",
  "de_train",
  "de_vertigo",
]);

export function mapArt(mapName: string, stored?: string | null): string | null {
  if (stored && stored.trim()) return stored;
  const name = mapName.trim().toLowerCase();
  return SHIPPED.has(name) ? `/maps/${name}.webp` : null;
}

/** "de_dust2" → "Dust2". Used when a map has no display name of its own. */
export function mapLabel(mapName: string): string {
  return mapName
    .replace(/^(de_|cs_|ar_)/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
