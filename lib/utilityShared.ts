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
 * The other direction — a click on the radar back to world coordinates.
 *
 * Needed for destination-first browsing: people do not think "show me lineups
 * from T spawn", they think "I need Window smoked". Clicking the place you
 * want the smoke is the question they are actually asking.
 */
export function percentToWorld(cfg: MapOverview, left: number, top: number): { x: number; y: number } | null {
  if (cfg.posX === null || cfg.posY === null || !cfg.scale) return null;
  const px = (left / 100) * RADAR_SIZE;
  const py = (top / 100) * RADAR_SIZE;
  return { x: px * cfg.scale + cfg.posX, y: cfg.posY - py * cfg.scale };
}

/** Whether a world position falls on the radar image at all. */
export function isOnRadar(cfg: MapOverview, x: number, y: number): boolean {
  const p = worldToRadar(cfg, x, y);
  return !!p && p.px >= 0 && p.px <= RADAR_SIZE && p.py >= 0 && p.py <= RADAR_SIZE;
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
  { id: "smoke", label: "Smoke", weapon: "weapon_smokegrenade", colour: "#8bb8d8" },
  { id: "flash", label: "Flash", weapon: "weapon_flashbang", colour: "#e8d24a" },
  { id: "molotov", label: "Molotov", weapon: "weapon_molotov", colour: "#e8703a" },
  { id: "he", label: "HE", weapon: "weapon_hegrenade", colour: "#7fbf5f" },
  { id: "decoy", label: "Decoy", weapon: "weapon_decoy", colour: "#b58fd8" },
] as const;

export const UTIL_COLOUR: Record<string, string> = Object.fromEntries(
  UTILITIES.map((u) => [u.id, u.colour])
);

export const weaponFor = (utility: string): string =>
  UTILITIES.find((u) => u.id === utility)?.weapon ?? "weapon_smokegrenade";

/**
 * How to actually throw it, spelled out rather than jargon.
 *
 * The wording is the one every lineup site uses, because someone arriving from
 * cs2util or csnades should not have to work out that our "step-jump" is their
 * "run + jump throw".
 *
 * run-jump and w-jump are deliberately separate. A run-up from A to B and
 * "press W and jump together, no step taken" are different throws that land
 * differently — the old taxonomy had one "run" for both, and its label read
 * "Run + jump throw", which is why every row that used it is flagged for
 * review rather than silently assumed.
 *
 * This list is the canonical one; UtilityModule.ThrowTypes in the plugin
 * mirrors it, and a value added on one side without the other is rejected at
 * capture time rather than stored as something nothing can render.
 */
export const THROW_TYPES = [
  { id: "stand", label: "Standing throw", short: "", hint: "Still, feet planted." },
  { id: "crouch", label: "Crouch throw", short: "Crouch", hint: "Held crouch while you throw." },
  { id: "walk", label: "Walk throw", short: "Walk", hint: "Shift-walking into the throw." },
  { id: "jump", label: "Jump throw", short: "Jump", hint: "Jump from standing, no movement key." },
  { id: "w-jump", label: "W + jump throw", short: "W+Jump", hint: "Forward and jump pressed together — no step taken." },
  { id: "step-jump", label: "Step + jump throw", short: "Step+Jump", hint: "One step, then jumpthrow." },
  { id: "2step-jump", label: "Two-step jump throw", short: "2Step+Jump", hint: "Two steps, then jumpthrow." },
  { id: "run-jump", label: "Running jump throw", short: "Run+Jump", hint: "A real run-up from A to B, then jumpthrow." },
  { id: "crouch-jump", label: "Crouch jump throw", short: "Crouch+Jump", hint: "Crouch into the jump." },
] as const;

export type ThrowTypeId = (typeof THROW_TYPES)[number]["id"];

export const THROW_LABEL: Record<string, string> = Object.fromEntries(
  THROW_TYPES.map((t) => [t.id, t.label])
);

/** The compact form, for a badge on a list row where there is no space. */
export const THROW_SHORT: Record<string, string> = Object.fromEntries(
  THROW_TYPES.map((t) => [t.id, t.short])
);

/** What the throw actually asks you to do, since the names only half say. */
export const THROW_HINT: Record<string, string> = Object.fromEntries(
  THROW_TYPES.map((t) => [t.id, t.hint])
);

/** Throws that involve leaving the ground, and so need a marked start point. */
export const RUNUP_THROWS = new Set<string>([
  "w-jump", "step-jump", "2step-jump", "run-jump",
]);

export const CLICK_LABEL: Record<string, string> = {
  left: "Left click",
  right: "Right click",
  both: "Left + right click",
};

/** What the button actually does to the throw, since the names do not say. */
export const CLICK_HINT: Record<string, string> = {
  left: "full strength — the long throw",
  right: "gentle underhand toss — short range",
  both: "medium strength — between the two",
};

export const PURPOSE_LABEL: Record<string, string> = {
  default: "Default",
  execute: "Execute",
  retake: "Retake",
  postplant: "Post-plant",
  trick: "Trick",
};

export const TEAM_LABEL: Record<string, string> = {
  T: "Terrorist",
  CT: "Counter-Terrorist",
  "": "Either side",
};

/**
 * The console line every site publishes and every practice server accepts.
 *
 * Six decimal places because that is the format the ecosystem uses and what
 * the console reads back unchanged — rounding here would make a lineup copied
 * out of this page and pasted into a server land somewhere slightly else.
 */
export const setposFor = (l: Pick<Lineup, "stand" | "view">): string =>
  `setpos ${l.stand.x.toFixed(6)} ${l.stand.y.toFixed(6)} ${l.stand.z.toFixed(6)};` +
  `setang ${l.view.pitch.toFixed(6)} ${l.view.yaw.toFixed(6)} 0.000000`;

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
  /** In-game stills: where you stand, what you aim at, where it landed. */
  shots: { stand: string | null; aim: string | null; result: string | null };
  verified: boolean;
  source: string;
};

/** Does this lineup have any picture at all to show? */
export const hasShots = (l: Lineup): boolean =>
  Boolean(l.shots.stand || l.shots.aim || l.shots.result || l.thumb);

/**
 * Sort order for the list.
 *
 * Area first, then grenade, then name: it groups a map into the places you
 * actually stand, which is how someone drilling an execute reads it. Lineups
 * with pictures float to the top of their group because those are the ones
 * that can be learned without loading the game.
 */
export function compareLineups(a: Lineup, b: Lineup): number {
  const area = (a.area || "~").localeCompare(b.area || "~");
  if (area) return area;
  const shots = Number(hasShots(b)) - Number(hasShots(a));
  if (shots) return shots;
  const util = a.utility.localeCompare(b.utility);
  if (util) return util;
  return a.name.localeCompare(b.name);
}

/** Free-text search across the fields someone would actually type. */
export function matchesQuery(l: Lineup, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    l.name.toLowerCase().includes(needle) ||
    l.area.toLowerCase().includes(needle) ||
    l.utility.toLowerCase().includes(needle) ||
    (l.notes ?? "").toLowerCase().includes(needle)
  );
}
