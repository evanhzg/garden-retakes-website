import React from "react";

/**
 * The weapon on a killfeed line.
 *
 * Drawn rather than fetched. CS2 ships weapon art as game files this deployment
 * has no access to, and the alternative — a sprite sheet lifted from the game —
 * is somebody else's copyright on our page. These are silhouettes: enough to
 * tell an AWP from a Deagle at a glance, which is the entire job.
 *
 * Every icon is drawn in the same 64x24 box and pointing the same way, so a
 * column of them lines up instead of jittering. `currentColor` throughout, so
 * the feed can tint a line — red for a teamkill, accent for a headshot — by
 * setting a colour on the row rather than by having two of every icon.
 *
 * Unknown weapons fall back by class, then to a generic mark. A feed that draws
 * nothing for a weapon nobody anticipated has a hole in it; one that draws
 * "a rifle" is right often enough to be useful and never misleading.
 */

type Props = { weapon: string; className?: string };

const box = {
  viewBox: "0 0 64 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A long gun: barrel, receiver, magazine, stock. The rifle family. */
const Rifle = (
  <>
    <path d="M4 11h44" />
    <path d="M48 11h11" />
    <path d="M14 11v5h6l2-5" />
    <path d="M20 16l-1 5h5l1-5" />
    <path d="M4 11v3h5" />
    <path d="M34 11v3h8" />
  </>
);

/** Shorter barrel, steeper magazine, no stock to speak of. */
const Smg = (
  <>
    <path d="M10 11h34" />
    <path d="M44 11h9" />
    <path d="M18 11v4h5l2-4" />
    <path d="M23 15l-1 6h5l1-6" />
    <path d="M10 11v3h4" />
  </>
);

/** The scope is the whole silhouette of a sniper. */
const Sniper = (
  <>
    <path d="M2 13h48" />
    <path d="M50 13h12" />
    <rect x="20" y="5" width="18" height="5" rx="1" />
    <path d="M24 10v3" />
    <path d="M34 10v3" />
    <path d="M16 13v5h6l2-5" />
    <path d="M2 13v3h6" />
  </>
);

/** Slide, grip, trigger guard. */
const Pistol = (
  <>
    <path d="M20 9h26" />
    <path d="M20 9v5h20V9" />
    <path d="M26 14l-4 8h6l3-8" />
    <path d="M30 14v3h6" />
  </>
);

/** Wide bore and a pump under the barrel. */
const Shotgun = (
  <>
    <path d="M4 11h42" />
    <path d="M46 11h13" />
    <path d="M22 11v4h12v-4" />
    <path d="M16 11v4h4" />
    <path d="M12 15h10" />
    <path d="M4 11v4h6" />
  </>
);

/** A box magazine is what makes a machine gun read as one. */
const Mg = (
  <>
    <path d="M6 10h40" />
    <path d="M46 10h12" />
    <rect x="18" y="10" width="14" height="9" rx="1" />
    <path d="M12 10v4h5" />
    <path d="M6 10v3h4" />
    <path d="M34 10v4h8" />
  </>
);

/** Blade and guard, angled so it does not read as a pistol. */
const Knife = (
  <>
    <path d="M10 18l26-11" />
    <path d="M10 18l4 3 26-11-4-3z" />
    <path d="M40 10l8-3" />
    <path d="M44 5l3 7" />
  </>
);

/** A grenade body with its spoon. */
const Grenade = (
  <>
    <circle cx="30" cy="14" r="7" />
    <path d="M27 7V4h6v3" />
    <path d="M33 5l5-2" />
    <path d="M26 12l3 3 5-6" />
  </>
);

/** Fire, for molotov and incendiary. */
const Fire = (
  <>
    <path d="M30 21c-5 0-8-3-8-7 0-4 4-6 4-10 3 2 4 4 4 6 1-2 3-3 3-5 3 3 5 6 5 9 0 4-3 7-8 7z" />
  </>
);

/** Concentric rings: something that goes off rather than something you shoot. */
const Blast = (
  <>
    <circle cx="30" cy="12" r="4" />
    <path d="M30 3v3" />
    <path d="M30 18v3" />
    <path d="M21 12h3" />
    <path d="M36 12h3" />
    <path d="M23.6 5.6l2.1 2.1" />
    <path d="M34.3 16.3l2.1 2.1" />
    <path d="M36.4 5.6l-2.1 2.1" />
    <path d="M25.7 16.3l-2.1 2.1" />
  </>
);

/** Neither a gun nor a grenade: fall damage, the world, an unknown cause. */
const Generic = (
  <>
    <circle cx="30" cy="12" r="7" />
    <path d="M30 8v5" />
    <path d="M30 16v.5" />
  </>
);

/**
 * Weapon name to shape.
 *
 * Keyed on the bare engine name — "ak47", not "weapon_ak47" — which the ingest
 * has already normalised. Grouped by what the silhouette is, because thirty
 * rifles do not need thirty drawings and pretending otherwise would mean thirty
 * chances to draw one badly.
 */
const SNIPERS = new Set(["awp", "ssg08", "scar20", "g3sg1"]);
const RIFLES = new Set([
  "ak47", "m4a1", "m4a1_silencer", "m4a4", "galilar", "famas", "aug", "sg556", "sg553",
]);
const SMGS = new Set(["mp9", "mac10", "mp7", "mp5sd", "ump45", "p90", "bizon"]);
const PISTOLS = new Set([
  "glock", "usp_silencer", "hkp2000", "p250", "fiveseven", "tec9", "cz75a",
  "deagle", "revolver", "elite",
]);
const SHOTGUNS = new Set(["nova", "xm1014", "mag7", "sawedoff"]);
const MGS = new Set(["m249", "negev"]);
const GRENADES = new Set(["hegrenade", "flashbang", "smokegrenade", "decoy", "tagrenade"]);
const FIRE = new Set(["molotov", "incgrenade", "inferno", "firebomb"]);
const BLAST = new Set(["planted_c4", "c4", "bomb"]);

function shapeFor(weapon: string): React.ReactNode {
  const w = weapon.toLowerCase().replace(/^weapon_/, "");

  if (w.includes("knife") || w === "bayonet") return Knife;
  if (SNIPERS.has(w)) return Sniper;
  if (RIFLES.has(w)) return Rifle;
  if (SMGS.has(w)) return Smg;
  if (PISTOLS.has(w)) return Pistol;
  if (SHOTGUNS.has(w)) return Shotgun;
  if (MGS.has(w)) return Mg;
  if (GRENADES.has(w)) return Grenade;
  if (FIRE.has(w)) return Fire;
  if (BLAST.has(w)) return Blast;

  // Nothing matched. Guess by family before giving up, so a weapon added to the
  // game after this was written still draws as roughly the right thing.
  if (w.includes("grenade") || w.includes("nade")) return Grenade;
  if (w.includes("knife")) return Knife;
  if (w.includes("taser") || w.includes("zeus")) return Blast;
  return Generic;
}

export default function WeaponIcon({ weapon, className }: Props) {
  return (
    <svg
      {...box}
      className={className}
      width="42"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      {shapeFor(weapon)}
    </svg>
  );
}

/** A headshot, drawn beside the weapon rather than written out. */
export function HeadshotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15" />
    </svg>
  );
}
