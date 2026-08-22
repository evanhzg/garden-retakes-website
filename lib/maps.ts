// The retakes map pool, for the half of the app that is TypeScript.
//
// Mirrors MAP_POOLS.retakes in scripts/retakesMatchmaking.js, which is CommonJS
// on the socket server and cannot import this — the same split, and the same
// rule, as effectiveElo() in lib/competitive.ts. Change both.
//
// A map added here needs a screenshot too, or its card renders a broken image:
// see tools/map-screenshots.

export const RETAKES_MAPS = [
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
] as const;

export type RetakesMap = (typeof RETAKES_MAPS)[number];

/** Most a player may drop. Mirrors MAX_EXCLUDED_MAPS in the matchmaker. */
export const MAX_EXCLUDED_MAPS = 4;

export const isRetakesMap = (v: unknown): v is RetakesMap =>
  typeof v === "string" && (RETAKES_MAPS as readonly string[]).includes(v);

/** The picture of a map, not the diagram of it. See tools/map-screenshots. */
export const mapImage = (map: string) => `/maps/${map}.webp`;

/** The diagram — heatmaps and nade lineups, never a preview. */
export const mapRadar = (map: string) => `/radars/${map}.png`;

/**
 * What a map is called.
 *
 * Not translated, and not a translation problem: these are proper nouns and
 * every language calls Mirage "Mirage". The table was written out in
 * RetakesLobby and again in RetakeLoadout, which is how one of them ended up
 * with a different set of ten.
 */
export const MAP_LABELS: Record<string, string> = {
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_cache: "Cache",
  de_dust2: "Dust II",
  de_inferno: "Inferno",
  de_mirage: "Mirage",
  de_nuke: "Nuke",
  de_overpass: "Overpass",
  de_train: "Train",
  de_vertigo: "Vertigo",
};

export const mapName = (map: string) => MAP_LABELS[map] ?? map.replace(/^de_/, "");

/**
 * A stored exclusion list, made safe to use.
 *
 * Trimmed rather than trusted, for the reason the matchmaker's copy is: the row
 * outlives the pool it was written against, so a player who dropped four maps
 * that have since left the rotation must not end up excluding nothing, and one
 * written when the cap was higher must not empty the pool. Order is the pool's,
 * so two lists compare and display the same way whatever order they were
 * clicked in.
 */
export function sanitiseExcludedMaps(input: unknown): RetakesMap[] {
  const raw = Array.isArray(input) ? input : [];
  const wanted = new Set(raw.filter(isRetakesMap));
  return RETAKES_MAPS.filter((m) => wanted.has(m)).slice(0, MAX_EXCLUDED_MAPS);
}
