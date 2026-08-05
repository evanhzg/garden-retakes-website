// Competitive retakes loadout: what you want to be handed, and what you play as.
//
// Two halves that live in different places on purpose.
//
// The weapon half is not ours. The allocator plugin already keeps per-player
// weapon preferences in UserSettings.WeaponPreferences, keyed by side and by
// allocation type, and reads them every buy round. Writing a second, prettier
// copy on the website would produce a page that looks like it configures the
// game and does not, so this reads and writes that exact structure — numeric
// CsItem ids and all.
//
// The role and utility half has no in-game counterpart yet, so it lives in a
// website-owned table. It is honest about that: the page says which settings
// take effect in game today and which are for your team to read.

/** CsItem ids, taken from the enum the plugin compiles against. */
export const ITEMS = {
  // pistols
  Deagle: 200, Glock: 201, USPS: 202, P2000: 203, Dualies: 204,
  Tec9: 205, P250: 206, CZ: 207, FiveSeven: 208, R8: 209,
  // smgs & shotguns
  Mac10: 300, MP9: 301, MP7: 302, P90: 303, MP5: 304,
  Bizon: 305, UMP45: 306, XM1014: 307, Nova: 308, MAG7: 309, SawedOff: 310,
  M249: 311, Negev: 312,
  // rifles & snipers
  AK47: 400, M4A1S: 401, M4A4: 402, Galil: 403, Famas: 404,
  SG553: 405, AWP: 406, AUG: 407, SSG08: 408, SCAR20: 409, G3SG1: 410,
} as const;

export type Side = "T" | "CT";

/** The plugin serialises the side as the CsTeam name, not the short form. */
export const TEAM_KEY: Record<Side, string> = {
  T: "Terrorist",
  CT: "CounterTerrorist",
};

/**
 * The four slots the allocator fills, in the order a round gets bought.
 *
 * `Preferred` also exists in the plugin (the AWP queue) but is deliberately not
 * offered here: it is a claim on a shared resource decided round by round in
 * game, and a website toggle would imply an entitlement it cannot honour.
 */
export type Slot = "PistolRound" | "Secondary" | "HalfBuyPrimary" | "FullBuyPrimary";

export const SLOTS: { id: Slot; round: "pistol" | "half" | "full"; labelKey: string }[] = [
  { id: "PistolRound", round: "pistol", labelKey: "loadout.slot.pistolRound" },
  { id: "Secondary", round: "half", labelKey: "loadout.slot.secondary" },
  { id: "HalfBuyPrimary", round: "half", labelKey: "loadout.slot.halfBuyPrimary" },
  { id: "FullBuyPrimary", round: "full", labelKey: "loadout.slot.fullBuyPrimary" },
];

type Choice = { id: number; name: string; sides: Side[] };

/**
 * What can go in each slot, per side.
 *
 * Side-restricted because half of these do not exist for the other team, and an
 * option that silently falls back to the default is worse than no option.
 */
export const CHOICES: Record<Slot, Choice[]> = {
  PistolRound: [
    { id: ITEMS.Glock, name: "Glock-18", sides: ["T"] },
    { id: ITEMS.USPS, name: "USP-S", sides: ["CT"] },
    { id: ITEMS.P2000, name: "P2000", sides: ["CT"] },
    { id: ITEMS.P250, name: "P250", sides: ["T", "CT"] },
    { id: ITEMS.Tec9, name: "Tec-9", sides: ["T"] },
    { id: ITEMS.FiveSeven, name: "Five-SeveN", sides: ["CT"] },
    { id: ITEMS.CZ, name: "CZ75-Auto", sides: ["T", "CT"] },
    { id: ITEMS.Dualies, name: "Dual Berettas", sides: ["T", "CT"] },
    { id: ITEMS.Deagle, name: "Desert Eagle", sides: ["T", "CT"] },
    { id: ITEMS.R8, name: "R8 Revolver", sides: ["T", "CT"] },
  ],
  Secondary: [
    { id: ITEMS.Deagle, name: "Desert Eagle", sides: ["T", "CT"] },
    { id: ITEMS.P250, name: "P250", sides: ["T", "CT"] },
    { id: ITEMS.Tec9, name: "Tec-9", sides: ["T"] },
    { id: ITEMS.FiveSeven, name: "Five-SeveN", sides: ["CT"] },
    { id: ITEMS.CZ, name: "CZ75-Auto", sides: ["T", "CT"] },
    { id: ITEMS.Dualies, name: "Dual Berettas", sides: ["T", "CT"] },
    { id: ITEMS.R8, name: "R8 Revolver", sides: ["T", "CT"] },
    { id: ITEMS.Glock, name: "Glock-18", sides: ["T"] },
    { id: ITEMS.USPS, name: "USP-S", sides: ["CT"] },
  ],
  HalfBuyPrimary: [
    { id: ITEMS.Mac10, name: "MAC-10", sides: ["T"] },
    { id: ITEMS.MP9, name: "MP9", sides: ["CT"] },
    { id: ITEMS.MP7, name: "MP7", sides: ["T", "CT"] },
    { id: ITEMS.MP5, name: "MP5-SD", sides: ["T", "CT"] },
    { id: ITEMS.UMP45, name: "UMP-45", sides: ["T", "CT"] },
    { id: ITEMS.P90, name: "P90", sides: ["T", "CT"] },
    { id: ITEMS.Bizon, name: "PP-Bizon", sides: ["T", "CT"] },
    { id: ITEMS.Galil, name: "Galil AR", sides: ["T"] },
    { id: ITEMS.Famas, name: "FAMAS", sides: ["CT"] },
    { id: ITEMS.SSG08, name: "SSG 08", sides: ["T", "CT"] },
    { id: ITEMS.Nova, name: "Nova", sides: ["T", "CT"] },
    { id: ITEMS.MAG7, name: "MAG-7", sides: ["CT"] },
    { id: ITEMS.SawedOff, name: "Sawed-Off", sides: ["T"] },
    { id: ITEMS.XM1014, name: "XM1014", sides: ["T", "CT"] },
  ],
  FullBuyPrimary: [
    { id: ITEMS.AK47, name: "AK-47", sides: ["T"] },
    { id: ITEMS.M4A4, name: "M4A4", sides: ["CT"] },
    { id: ITEMS.M4A1S, name: "M4A1-S", sides: ["CT"] },
    { id: ITEMS.AWP, name: "AWP", sides: ["T", "CT"] },
    { id: ITEMS.SG553, name: "SG 553", sides: ["T"] },
    { id: ITEMS.AUG, name: "AUG", sides: ["CT"] },
    { id: ITEMS.Galil, name: "Galil AR", sides: ["T"] },
    { id: ITEMS.Famas, name: "FAMAS", sides: ["CT"] },
    { id: ITEMS.SSG08, name: "SSG 08", sides: ["T", "CT"] },
    { id: ITEMS.G3SG1, name: "G3SG1", sides: ["T"] },
    { id: ITEMS.SCAR20, name: "SCAR-20", sides: ["CT"] },
    { id: ITEMS.M249, name: "M249", sides: ["T", "CT"] },
    { id: ITEMS.Negev, name: "Negev", sides: ["T", "CT"] },
  ],
};

export const choicesFor = (slot: Slot, side: Side): Choice[] =>
  CHOICES[slot].filter((c) => c.sides.includes(side));

export const itemName = (id: number | null | undefined): string | null => {
  if (id === null || id === undefined) return null;
  for (const list of Object.values(CHOICES)) {
    const hit = list.find((c) => c.id === id);
    if (hit) return hit.name;
  }
  return null;
};

// ------------------------------------------------------------------- roles

/**
 * Retake roles.
 *
 * Not the five-man roles from a normal match — a retake has no lurker and
 * nobody is holding an angle for ninety seconds. These are the jobs that
 * actually exist when four people walk onto a site with the bomb down.
 */
export const ROLES = [
  { id: "entry", side: "T" as const },
  { id: "support", side: "T" as const },
  { id: "trade", side: "T" as const },
  { id: "awp", side: "both" as const },
  { id: "anchor", side: "CT" as const },
  { id: "rotator", side: "CT" as const },
  { id: "flex", side: "both" as const },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export const isRole = (v: string): v is RoleId => ROLES.some((r) => r.id === v);

// ----------------------------------------------------------------- utility

export const UTILITY = ["smoke", "flash", "molotov", "he"] as const;
export type UtilityId = (typeof UTILITY)[number];

export const isUtility = (v: string): v is UtilityId =>
  (UTILITY as readonly string[]).includes(v);

export type RoundKind = "pistol" | "half" | "full";
export const ROUND_KINDS: RoundKind[] = ["pistol", "half", "full"];

/** Ordered preference per round type — first choice first. */
export type UtilityPrefs = Record<RoundKind, UtilityId[]>;

export const DEFAULT_UTILITY: UtilityPrefs = {
  pistol: ["flash", "smoke"],
  half: ["flash", "smoke", "molotov"],
  full: ["smoke", "flash", "molotov", "he"],
};

// ------------------------------------------------- WeaponPreferences codec

export type WeaponPrefs = Partial<Record<Side, Partial<Record<Slot, number>>>>;

/**
 * Decode the plugin's JSON blob.
 *
 * Tolerant on purpose: this column is written by the game server and read here,
 * so anything unexpected in it means the page shows defaults rather than an
 * error. A player looking at a broken settings page assumes their settings are
 * gone.
 */
export function decodeWeaponPrefs(raw: string | null | undefined): WeaponPrefs {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const out: WeaponPrefs = {};
  for (const side of ["T", "CT"] as Side[]) {
    const block = (parsed as Record<string, unknown>)[TEAM_KEY[side]];
    if (!block || typeof block !== "object") continue;
    const slots: Partial<Record<Slot, number>> = {};
    for (const { id } of SLOTS) {
      const v = (block as Record<string, unknown>)[id];
      if (typeof v === "number" && Number.isFinite(v)) slots[id] = v;
    }
    out[side] = slots;
  }
  return out;
}

/**
 * Encode back, preserving anything we do not manage.
 *
 * The plugin also stores `Preferred` in here. Serialising only the four slots
 * this page offers would silently clear a player's AWP preference the first
 * time they saved a pistol.
 */
export function encodeWeaponPrefs(prefs: WeaponPrefs, existingRaw: string | null | undefined): string {
  let base: Record<string, Record<string, number>> = {};
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (parsed && typeof parsed === "object") base = parsed;
    } catch {
      base = {};
    }
  }

  for (const side of ["T", "CT"] as Side[]) {
    const slots = prefs[side];
    if (!slots) continue;
    const key = TEAM_KEY[side];
    base[key] = { ...(base[key] ?? {}) };
    for (const { id } of SLOTS) {
      const value = slots[id];
      if (typeof value === "number") base[key][id] = value;
      else delete base[key][id];
    }
  }

  return JSON.stringify(base);
}

/** Rejects anything that is not a real choice for that side and slot. */
export function sanitiseWeaponPrefs(input: unknown): WeaponPrefs {
  const out: WeaponPrefs = {};
  if (!input || typeof input !== "object") return out;

  for (const side of ["T", "CT"] as Side[]) {
    const block = (input as Record<string, unknown>)[side];
    if (!block || typeof block !== "object") continue;
    const slots: Partial<Record<Slot, number>> = {};
    for (const { id } of SLOTS) {
      const v = (block as Record<string, unknown>)[id];
      if (typeof v !== "number") continue;
      if (choicesFor(id, side).some((c) => c.id === v)) slots[id] = v;
    }
    out[side] = slots;
  }
  return out;
}

export function sanitiseUtilityPrefs(input: unknown): UtilityPrefs {
  const out: UtilityPrefs = { ...DEFAULT_UTILITY };
  if (!input || typeof input !== "object") return out;
  for (const kind of ROUND_KINDS) {
    const list = (input as Record<string, unknown>)[kind];
    if (!Array.isArray(list)) continue;
    const cleaned = list
      .filter((v): v is string => typeof v === "string")
      .filter(isUtility)
      .filter((v, i, a) => a.indexOf(v) === i);
    out[kind] = cleaned;
  }
  return out;
}
