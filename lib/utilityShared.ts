import overviews from "@/data/mapOverviews.json";

// Everything the utility page needs on both sides of the wire.
//
// Isomorphic on purpose: the page draws markers in the browser and the API
// filters and validates on the server, and both have to agree on what a map is
// and where a coordinate lands. Splitting that in two is how the marker and the
// teleport end up in different places.

export type MapOverview = {
  label: string;
  posX: number | null;
  posY: number | null;
  scale: number | null;
  rotate: number;
  pools: string[];
  levels?: { name: string; altitudeMax: number; altitudeMin: number }[];
};

export const RADAR_SIZE: number = (overviews as { radarSize: number }).radarSize;

export const MAPS = (overviews as unknown as { maps: Record<string, MapOverview> }).maps;

export const isKnownMap = (m: string): boolean => Object.hasOwn(MAPS, m);

/** Maps that can actually be drawn — the rest have no calibration yet. */
export const playableMaps = (): [string, MapOverview][] =>
  Object.entries(MAPS).filter(([, cfg]) => cfg.scale !== null);

export const POOLS = [
  { id: "active", label: "Active duty" },
  { id: "reserve", label: "Reserves" },
  { id: "wingman", label: "Wingman" },
] as const;

/**
 * World coordinates → radar pixels, on a RADAR_SIZE square.
 *
 * Straight out of the game's own overview file: the radar is an orthographic
 * shot with its top-left at (posX, posY), so X grows right and Y grows *down*
 * the image while world Y grows the other way.
 */
export function worldToRadar(cfg: MapOverview, x: number, y: number): { px: number; py: number } | null {
  if (cfg.posX === null || cfg.posY === null || !cfg.scale) return null;
  return { px: (x - cfg.posX) / cfg.scale, py: (cfg.posY - y) / cfg.scale };
}

/** As a percentage, which is what the markers are positioned with. */
export function worldToPercent(cfg: MapOverview, x: number, y: number): { left: number; top: number } | null {
  const p = worldToRadar(cfg, x, y);
  return p && { left: (p.px / RADAR_SIZE) * 100, top: (p.py / RADAR_SIZE) * 100 };
}

/**
 * Which radar a lineup belongs on.
 *
 * Nuke, Train and Vertigo are stacked maps: the same X/Y means two different
 * places depending on height, so a lineup thrown from lower has to be drawn on
 * the lower radar or it lands on top of something unrelated.
 */
export function levelFor(cfg: MapOverview, z: number): string {
  if (!cfg.levels?.length) return "default";
  const hit = cfg.levels.find((l) => z <= l.altitudeMax && z >= l.altitudeMin);
  return hit?.name ?? "default";
}

export const radarUrl = (map: string, level: string): string =>
  `/radars/${map}${level === "default" ? "" : `_${level}`}.png`;

export const UTILITIES = [
  { id: "smoke", label: "Smoke", weapon: "weapon_smokegrenade" },
  { id: "flash", label: "Flash", weapon: "weapon_flashbang" },
  { id: "molotov", label: "Molotov", weapon: "weapon_molotov" },
  { id: "he", label: "HE", weapon: "weapon_hegrenade" },
  { id: "decoy", label: "Decoy", weapon: "weapon_decoy" },
] as const;

export const weaponFor = (utility: string): string =>
  UTILITIES.find((u) => u.id === utility)?.weapon ?? "weapon_smokegrenade";

/** How to actually throw it, spelled out rather than jargon. */
export const THROW_LABEL: Record<string, string> = {
  standing: "Stand still and throw",
  jump: "Jump-throw",
  "step-jump": "Take a step, then jump-throw",
  run: "Run and throw",
  crouch: "Crouch and throw",
};

export const CLICK_LABEL: Record<string, string> = {
  left: "Left click",
  right: "Right click (short lob)",
  both: "Both buttons (medium)",
};

export type Lineup = {
  id: number;
  map: string;
  name: string;
  area: string;
  utility: string;
  purpose: string;
  team: string;
  throwType: string;
  clickType: string;
  stand: { x: number; y: number; z: number };
  view: { pitch: number; yaw: number };
  land: { x: number; y: number; z: number } | null;
  notes: string | null;
  clipUrl: string | null;
  thumb: string | null;
  verified: boolean;
  source: string;
};
