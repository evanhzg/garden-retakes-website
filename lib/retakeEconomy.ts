import { canUseWeapon, type RoleId } from "@/lib/competitive";

// The Blitz economy.
//
// Retakes normally has no economy at all: the allocator hands out a gun and the
// round starts. That works when the mode is a warm-up, and stops working the
// moment the result is worth rating — with free rifles every round there is
// nothing to play for except the round itself, no reason to save, and no such
// thing as a bad buy.
//
// So this mode has a real one. It is *hidden*: nobody opens a buy menu and
// nobody loses a round because they forgot to buy. Each player has money, the
// round decides what they can afford, and the allocator spends it for them
// along their stated preferences. What players see is that some rounds they
// have an AK and a full bag and some rounds they have an MP9 and one flash —
// and that this follows from how the last few rounds went.
//
// Everything here is deliberately explainable, because /retakes/economy renders
// these exact numbers rather than a prose description of them.

// ------------------------------------------------------------------- the sides
//
// A retake starts with the bomb already planted. The Terrorists are holding a
// site they have taken; the Counter-Terrorists are coming to take it back.
// That asymmetry drives the whole utility table below.

export type Side = "T" | "CT";

// ---------------------------------------------------------------------- income

/** Everyone starts here, which is a pistol and not much else. */
export const STARTING_MONEY = 800;

/** Nobody carries more than this between rounds. */
export const MAX_MONEY = 16000;

export const WIN_REWARD = 3250;

/**
 * Losing pays, and pays more the longer you keep losing.
 *
 * Without this a team that drops two rounds never buys again and the match is
 * decided by round three. The ladder is the mechanism that lets a losing team
 * come back with a full buy, which is what makes saving a decision rather than
 * a formality.
 */
export const LOSS_LADDER = [1400, 1900, 2400, 2900, 3400];

/** Held the site to the end of the timer, or traded down and survived. */
export const SURVIVAL_BONUS = 200;

/** CT only, and the round-winning act on that side. */
export const DEFUSE_REWARD = 600;
/** T only: the bomb went off because the site was held. */
export const EXPLODE_REWARD = 600;

/** Per kill, by weapon class. Matches CS's own scale so it reads as familiar. */
export const KILL_REWARD: Record<string, number> = {
  rifle: 300,
  sniper: 100,
  smg: 600,
  shotgun: 900,
  pistol: 300,
  knife: 1500,
  default: 300,
};

// ----------------------------------------------------------------- round types

export type RoundKind = "pistol" | "eco" | "half" | "full";

export const MAX_ROUNDS = 24;
export const HALF_LENGTH = MAX_ROUNDS / 2;

/**
 * What a round is, decided from what the team can actually afford.
 *
 * Worked out from the team's average rather than per player, because a retake
 * is won or lost together: one person with an AK in a team of MP9s is a lost
 * round with an expensive corpse in it.
 */
/**
 * The thresholds are derived from what a buy actually costs, not picked.
 *
 * A CT full buy is an M4 (2900) plus helmet (1000) plus a kit (400) plus two
 * flashes and a smoke (700) — 5000. Setting the bar at a rifle's price alone
 * meant "full buy" rounds where the allocator spent everything on the gun and
 * armour and handed out no utility at all, which is not a full buy in any sense
 * a player would recognise.
 */
export const ROUND_THRESHOLDS = {
  /** Below this the team is saving, whether it meant to or not. */
  eco: 2200,
  /** An SMG, armour and a grenade or two; not rifles all round. */
  half: 4200,
  /** Rifle, armour, kit and a usable bag of utility. */
  full: 5200,
} as const;

export function roundKindFor(averageMoney: number, roundNumber: number): RoundKind {
  // The opening round of each half is a pistol round by definition — money has
  // just been reset, so classifying it by threshold would say "eco" and mean
  // less than it should.
  if (roundNumber === 1 || roundNumber === HALF_LENGTH + 1) return "pistol";
  if (averageMoney < ROUND_THRESHOLDS.eco) return "eco";
  if (averageMoney < ROUND_THRESHOLDS.half) return "half";
  return "full";
}

// --------------------------------------------------------------------- prices

export const PRICES: Record<string, number> = {
  weapon_glock: 0, weapon_usp_silencer: 0, weapon_hkp2000: 0,
  weapon_p250: 300, weapon_tec9: 500, weapon_fiveseven: 500,
  weapon_cz75a: 500, weapon_deagle: 700, weapon_elite: 300, weapon_revolver: 600,

  weapon_mac10: 1050, weapon_mp9: 1250, weapon_mp7: 1500, weapon_mp5sd: 1500,
  weapon_ump45: 1200, weapon_p90: 2350, weapon_bizon: 1400,
  weapon_nova: 1050, weapon_xm1014: 2000, weapon_mag7: 1300, weapon_sawedoff: 1100,

  weapon_galilar: 1800, weapon_famas: 2050, weapon_ak47: 2700, weapon_m4a1: 2900,
  weapon_m4a1_silencer: 2900, weapon_sg556: 3000, weapon_aug: 3300,
  weapon_ssg08: 1700, weapon_awp: 4750,

  item_kevlar: 650, item_assaultsuit: 1000, item_defuser: 400,

  weapon_flashbang: 200, weapon_smokegrenade: 300, weapon_hegrenade: 300,
  weapon_molotov: 400, weapon_incgrenade: 600,
};

export const priceOf = (item: string): number => PRICES[item] ?? 0;

// --------------------------------------------------------------- utility caps
//
// The asymmetry is the mode. Terrorists are holding a planted bomb and need to
// deny space; Counter-Terrorists have to clear a site and need to take it. So
// the retaking side carries the tools that break a hold, and the holding side
// carries the ones that stall it.
//
// Terrorists carry no HE at all. On a site the size of a retake, an HE thrown
// onto a defended plant is close to free damage on people who cannot leave it,
// and it made every round open the same way.

export type UtilityCaps = Record<string, number>;

export const UTILITY_CAPS: Record<Side, UtilityCaps> = {
  T: {
    weapon_smokegrenade: 1,
    weapon_molotov: 1,
    weapon_flashbang: 1,
    weapon_hegrenade: 0,
  },
  CT: {
    weapon_flashbang: 2,
    weapon_smokegrenade: 1,
    weapon_hegrenade: 2,
    weapon_incgrenade: 1,
  },
};

/** Total grenades a player may hold. The server raises the game's own limit to match. */
export const GRENADE_CARRY_LIMIT = 4;

// ------------------------------------------------------------- the allocation

export type Preferences = {
  role: RoleId | "";
  /** Preferred primary per round kind, as weapon ids. */
  primary: Partial<Record<RoundKind, string>>;
  secondary: string;
  /** Ordered — first choice bought first. */
  utility: string[];
  /** CT only. When false, utility is bought before the defuse kit. */
  kitFirst: boolean;
};

export type Loadout = {
  side: Side;
  roundKind: RoundKind;
  primary: string | null;
  secondary: string;
  armour: "none" | "kevlar" | "helmet";
  kit: boolean;
  utility: string[];
  spent: number;
  left: number;
  /** Why they did not get what they asked for, when that happened. */
  notes: string[];
};

const FALLBACK_PRIMARY: Record<RoundKind, Record<Side, string | null>> = {
  pistol: { T: null, CT: null },
  eco: { T: null, CT: null },
  half: { T: "weapon_mac10", CT: "weapon_mp9" },
  full: { T: "weapon_ak47", CT: "weapon_m4a1_silencer" },
};

const DEFAULT_SECONDARY: Record<Side, string> = {
  T: "weapon_glock",
  CT: "weapon_usp_silencer",
};

/**
 * Spend one player's money.
 *
 * The order is the argument. Gun, then armour, then the things that are only
 * worth having if you live to use them — a player with four grenades and no
 * vest loses the duel that would have let them throw one.
 *
 * The kit is the exception, and it is where the player's own preference
 * decides: a defuse kit is ten seconds of the round, and someone who would
 * rather hold two flashes and let a team-mate carry it can say so.
 */
export function allocate(
  side: Side,
  roundKind: RoundKind,
  money: number,
  prefs: Preferences
): Loadout {
  const notes: string[] = [];
  let left = Math.max(0, money);

  const buy = (item: string): boolean => {
    const cost = priceOf(item);
    if (cost > left) return false;
    left -= cost;
    return true;
  };

  // --- primary -------------------------------------------------------------
  let primary: string | null = null;
  const wanted = prefs.primary[roundKind] ?? FALLBACK_PRIMARY[roundKind][side];

  if (wanted) {
    if (!canUseWeapon(prefs.role, wanted)) {
      notes.push("only the sniper may take an AWP or SSG 08");
      const fallback = FALLBACK_PRIMARY[roundKind][side];
      if (fallback && buy(fallback)) primary = fallback;
    } else if (buy(wanted)) {
      primary = wanted;
    } else {
      // Not affordable: drop to the cheapest thing a tier down rather than to
      // nothing, so a near-miss on money is not a pistol round.
      const fallback = FALLBACK_PRIMARY[roundKind === "full" ? "half" : roundKind][side];
      if (fallback && buy(fallback)) {
        primary = fallback;
        notes.push(`could not afford ${label(wanted)} — took ${label(fallback)}`);
      } else {
        notes.push(`could not afford ${label(wanted)}`);
      }
    }
  }

  // --- secondary -----------------------------------------------------------
  // The default pistol is free and always present; a preferred one is a buy.
  let secondary = DEFAULT_SECONDARY[side];
  if (prefs.secondary && prefs.secondary !== secondary && buy(prefs.secondary)) {
    secondary = prefs.secondary;
  }

  // --- armour --------------------------------------------------------------
  let armour: Loadout["armour"] = "none";
  if (buy("item_assaultsuit")) armour = "helmet";
  else if (buy("item_kevlar")) armour = "kevlar";

  // --- kit vs utility ------------------------------------------------------
  let kit = false;
  const takeKit = () => {
    if (side !== "CT" || kit) return;
    if (buy("item_defuser")) kit = true;
  };

  if (prefs.kitFirst) takeKit();

  const caps = UTILITY_CAPS[side];
  const held: Record<string, number> = {};
  const utility: string[] = [];

  for (const item of prefs.utility) {
    if (utility.length >= GRENADE_CARRY_LIMIT) break;
    const cap = caps[item] ?? 0;
    // Silent when the cap is zero: that is a rule of the mode, not a failure
    // to afford something, and saying so every round would be noise.
    if (cap === 0) continue;
    if ((held[item] ?? 0) >= cap) continue;
    if (!buy(item)) continue;
    held[item] = (held[item] ?? 0) + 1;
    utility.push(item);
  }

  if (!prefs.kitFirst) takeKit();

  if (side === "CT" && !kit) notes.push("no defuse kit this round");

  return {
    side,
    roundKind,
    primary,
    secondary,
    armour,
    kit,
    utility,
    spent: Math.max(0, money) - left,
    left,
    notes,
  };
}

/** Money after a round, before the next allocation. */
export function settle(
  money: number,
  won: boolean,
  lossStreak: number,
  extras: {
    kills?: { weaponClass: string }[];
    survived?: boolean;
    defused?: boolean;
    exploded?: boolean;
  } = {}
): number {
  let next = money;
  next += won ? WIN_REWARD : LOSS_LADDER[Math.min(lossStreak, LOSS_LADDER.length - 1)];
  for (const k of extras.kills ?? []) next += KILL_REWARD[k.weaponClass] ?? KILL_REWARD.default;
  if (extras.survived) next += SURVIVAL_BONUS;
  if (extras.defused) next += DEFUSE_REWARD;
  if (extras.exploded) next += EXPLODE_REWARD;
  return Math.min(MAX_MONEY, next);
}

// --------------------------------------------------------------------- labels

const LABELS: Record<string, string> = {
  weapon_ak47: "AK-47", weapon_m4a1: "M4A4", weapon_m4a1_silencer: "M4A1-S",
  weapon_awp: "AWP", weapon_ssg08: "SSG 08", weapon_sg556: "SG 553",
  weapon_aug: "AUG", weapon_galilar: "Galil AR", weapon_famas: "FAMAS",
  weapon_mac10: "MAC-10", weapon_mp9: "MP9", weapon_mp7: "MP7",
  weapon_mp5sd: "MP5-SD", weapon_ump45: "UMP-45", weapon_p90: "P90",
  weapon_bizon: "PP-Bizon", weapon_nova: "Nova", weapon_xm1014: "XM1014",
  weapon_mag7: "MAG-7", weapon_sawedoff: "Sawed-Off",
  weapon_glock: "Glock-18", weapon_usp_silencer: "USP-S", weapon_hkp2000: "P2000",
  weapon_p250: "P250", weapon_tec9: "Tec-9", weapon_fiveseven: "Five-SeveN",
  weapon_cz75a: "CZ75-Auto", weapon_deagle: "Desert Eagle",
  weapon_elite: "Dual Berettas", weapon_revolver: "R8 Revolver",
  weapon_flashbang: "Flashbang", weapon_smokegrenade: "Smoke",
  weapon_hegrenade: "HE Grenade", weapon_molotov: "Molotov",
  weapon_incgrenade: "Incendiary",
  item_kevlar: "Kevlar", item_assaultsuit: "Kevlar + Helmet", item_defuser: "Defuse Kit",
};

export const label = (item: string): string =>
  LABELS[item] ?? item.replace(/^(weapon|item)_/, "");
