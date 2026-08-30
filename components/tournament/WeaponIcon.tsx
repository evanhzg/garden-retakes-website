import React from "react";

/**
 * The weapon on a feed line, in CS2's killfeed style.
 *
 * Drawn, not extracted. CS2's own killfeed icons are game assets, and shipping
 * Valve's art on this site is not something a deploy should quietly do — so
 * these are redrawn to match the style rather than lifted: solid white
 * silhouettes, side on, muzzle to the LEFT, the way the game draws them between
 * the two names.
 *
 * Filled rather than stroked, which is the main thing that makes the game's
 * icons read at 16px where an outline turns to mush. Every icon is drawn in the
 * same 64x20 box on the same baseline so a column of them lines up instead of
 * jittering, and `currentColor` throughout so a row can tint the whole line.
 *
 * Per weapon where the shape actually differs — an AK is not an AWP is not a
 * Deagle — and shared where it genuinely does not: four shotguns whose
 * silhouettes differ by a few pixels are four chances to draw the same thing
 * three ways.
 */

type Props = { weapon: string; className?: string };

const BOX = {
  viewBox: "0 0 64 20",
  fill: "currentColor",
  stroke: "none",
} as const;

/* --------------------------------------------------------------- rifles --- */

/** AK: long barrel, angled magazine, fixed stock. */
const AK = (
  <>
    <path d="M2 8h30v3H2z" />
    <path d="M32 6h13v6H32z" />
    <path d="M45 7h5l9 2-9 2h-5z" />
    <path d="M33 12l-3 6h5l3-6z" />
    <path d="M22 11h6v3l-6 1z" />
    <path d="M2 8v-1h6v1z" />
  </>
);

/** M4: straight carry handle, tube stock, vertical magazine. */
const M4 = (
  <>
    <path d="M3 8h28v3H3z" />
    <path d="M31 6h14v6H31z" />
    <path d="M45 7h6l8 2-8 2h-6z" />
    <path d="M33 12l-2 6h4l2-6z" />
    <path d="M20 5h12v2H20z" />
    <path d="M3 8v-1h5v1z" />
  </>
);

/** Famas / Galil family: bullpup-ish, shorter body, straight mag. */
const RIFLE = (
  <>
    <path d="M4 8h27v3H4z" />
    <path d="M31 6h13v6H31z" />
    <path d="M44 7h6l8 2-8 2h-6z" />
    <path d="M33 12l-2 6h4l2-6z" />
    <path d="M21 11h6v3h-6z" />
  </>
);

/* -------------------------------------------------------------- snipers --- */

/** AWP: the scope is the silhouette, plus a very long barrel. */
const AWP = (
  <>
    <path d="M1 9h30v2.5H1z" />
    <path d="M31 7h14v6H31z" />
    <path d="M45 8h7l7 2-7 2h-7z" />
    <path d="M20 3h18v3H20z" />
    <path d="M24 6h2v1h-2z" />
    <path d="M33 6h2v1h-2z" />
    <path d="M33 13l-2 5h4l2-5z" />
  </>
);

/** Autosniper: scope, but a boxier receiver and a magazine. */
const AUTO_SNIPER = (
  <>
    <path d="M2 9h28v2.5H2z" />
    <path d="M30 7h15v6H30z" />
    <path d="M45 8h6l8 2-8 2h-6z" />
    <path d="M22 4h15v3H22z" />
    <path d="M32 13l-2 5h4l2-5z" />
    <path d="M24 13h6v4h-6z" />
  </>
);

/* ----------------------------------------------------------------- smgs --- */

/** SMG: short barrel, steep magazine, folding stock. */
const SMG = (
  <>
    <path d="M10 8h20v3H10z" />
    <path d="M30 6h11v6H30z" />
    <path d="M41 7h5l7 2-7 2h-5z" />
    <path d="M31 12l-3 7h4l3-7z" />
    <path d="M22 11h5v2h-5z" />
  </>
);

/** P90: the humpbacked top magazine is the whole recognition. */
const P90 = (
  <>
    <path d="M8 9h18v3H8z" />
    <path d="M26 7h16v6H26z" />
    <path d="M42 8h5l7 2-7 2h-5z" />
    <path d="M26 5h14v2H26z" />
    <path d="M30 13l-2 6h4l2-6z" />
  </>
);

/* -------------------------------------------------------------- pistols --- */

/** Standard pistol: slide, grip, trigger guard. */
const PISTOL = (
  <>
    <path d="M24 7h20v4H24z" />
    <path d="M28 11l-4 9h5l4-9z" />
    <path d="M33 11h9v2h-9z" />
    <path d="M44 8h3v2h-3z" />
  </>
);

/** Deagle: heavier slide and a longer barrel than the rest. */
const DEAGLE = (
  <>
    <path d="M20 6h26v5H20z" />
    <path d="M25 11l-5 9h6l4-9z" />
    <path d="M31 11h11v2H31z" />
    <path d="M46 7h4v3h-4z" />
  </>
);

/** Revolver: cylinder is the tell. */
const REVOLVER = (
  <>
    <path d="M22 7h22v3.5H22z" />
    <path d="M30 6h7v6h-7z" />
    <path d="M28 12l-4 8h5l4-8z" />
    <path d="M44 7h4v3h-4z" />
  </>
);

/* ---------------------------------------------------------- heavy / etc --- */

/** Shotgun: wide bore, pump under the barrel. */
const SHOTGUN = (
  <>
    <path d="M2 8h30v3H2z" />
    <path d="M32 6h13v6H32z" />
    <path d="M45 7h5l9 2-9 2h-5z" />
    <path d="M12 11h14v2H12z" />
    <path d="M34 12l-2 6h4l2-6z" />
  </>
);

/** Machine gun: a box magazine hanging under a long body. */
const MG = (
  <>
    <path d="M2 7h30v3H2z" />
    <path d="M32 5h13v6H32z" />
    <path d="M45 6h6l8 2-8 2h-6z" />
    <path d="M22 10h14v8H22z" />
    <path d="M10 10h6v3h-6z" />
  </>
);

/** Knife: blade and handle, angled so it cannot read as a pistol. */
const KNIFE = (
  <>
    <path d="M8 16l4 4 30-13-3-4z" />
    <path d="M42 3h10v3l-9 4z" />
  </>
);

/** Zeus. */
const TASER = (
  <>
    <path d="M26 7h16v4H26z" />
    <path d="M30 11l-4 9h5l4-9z" />
    <path d="M42 6h4v2h-4z" />
    <path d="M42 10h4v2h-4z" />
  </>
);

/* ------------------------------------------------------------- grenades --- */

const HE = (
  <>
    <ellipse cx="32" cy="12" rx="6" ry="7" />
    <path d="M29 4h6v2h-6z" />
    <path d="M35 4h5v1.5h-5z" />
  </>
);

const FLASH = (
  <>
    <path d="M28 5h8v9a4 4 0 0 1-8 0z" />
    <path d="M29 2h6v3h-6z" />
    <path d="M36 2h5v1.5h-5z" />
  </>
);

const SMOKE = (
  <>
    <rect x="27" y="5" width="10" height="13" rx="4" />
    <path d="M29 2h6v3h-6z" />
    <path d="M37 2h4v1.5h-4z" />
  </>
);

const MOLOTOV = (
  <>
    <path d="M28 8h8v8a4 4 0 0 1-8 0z" />
    <path d="M30 3h4v5h-4z" />
    <path d="M34 1c2 1 3 3 1 4" />
  </>
);

/** The bomb going off, and the bomb being defused. */
const C4 = (
  <>
    <rect x="24" y="6" width="16" height="10" rx="1" />
    <path d="M27 9h4v2h-4z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M33 9h6v1h-6z" />
    <path d="M33 12h4v1h-4z" />
  </>
);

const DEFUSE = (
  <>
    <rect x="22" y="7" width="14" height="9" rx="1" />
    <path d="M38 4l6 6-6 6-2-2 4-4-4-4z" />
    <path d="M25 10h5v1.5h-5z" />
  </>
);

/** Fall damage, the world, anything with no weapon behind it. */
const SKULL = (
  <>
    <path d="M32 4a9 9 0 0 0-9 9c0 3 2 4 2 6h14c0-2 2-3 2-6a9 9 0 0 0-9-9z" />
    <circle cx="28" cy="12" r="2" fill="var(--kf-bg, #111)" />
    <circle cx="36" cy="12" r="2" fill="var(--kf-bg, #111)" />
  </>
);

const EXACT: Record<string, React.ReactNode> = {
  ak47: AK,
  m4a1: M4,
  m4a1_silencer: M4,
  m4a4: M4,
  aug: M4,
  sg556: RIFLE,
  sg553: RIFLE,
  galilar: RIFLE,
  famas: RIFLE,

  awp: AWP,
  ssg08: AWP,
  scar20: AUTO_SNIPER,
  g3sg1: AUTO_SNIPER,

  p90: P90,
  mp9: SMG,
  mac10: SMG,
  mp7: SMG,
  mp5sd: SMG,
  ump45: SMG,
  bizon: SMG,

  deagle: DEAGLE,
  revolver: REVOLVER,
  glock: PISTOL,
  usp_silencer: PISTOL,
  hkp2000: PISTOL,
  p250: PISTOL,
  fiveseven: PISTOL,
  tec9: PISTOL,
  cz75a: PISTOL,
  elite: PISTOL,

  nova: SHOTGUN,
  xm1014: SHOTGUN,
  mag7: SHOTGUN,
  sawedoff: SHOTGUN,

  m249: MG,
  negev: MG,

  taser: TASER,

  hegrenade: HE,
  flashbang: FLASH,
  smokegrenade: SMOKE,
  decoy: SMOKE,
  molotov: MOLOTOV,
  incgrenade: MOLOTOV,
  inferno: MOLOTOV,

  planted_c4: C4,
  c4: C4,
};

function shapeFor(weapon: string): React.ReactNode {
  const w = weapon.toLowerCase().replace(/^weapon_/, "");
  if (EXACT[w]) return EXACT[w];

  // Nothing matched. Guess by family, so a weapon added to the game after this
  // was written still draws as roughly the right thing rather than as nothing.
  if (w.includes("knife") || w === "bayonet") return KNIFE;
  if (w.includes("grenade") || w.includes("nade")) return HE;
  if (w.includes("zeus") || w.includes("taser")) return TASER;
  if (w.includes("rifle")) return RIFLE;
  return SKULL;
}

export default function WeaponIcon({ weapon, className }: Props) {
  return (
    <svg {...BOX} className={className} width="40" height="13" aria-hidden="true" focusable="false">
      {shapeFor(weapon)}
    </svg>
  );
}

/** The defuse kit, for a defuse line. */
export function DefuseIcon({ className }: { className?: string }) {
  return (
    <svg {...BOX} className={className} width="40" height="13" aria-hidden="true" focusable="false">
      {DEFUSE}
    </svg>
  );
}

/** The bomb, for a round won by detonation. */
export function BombIcon({ className }: { className?: string }) {
  return (
    <svg {...BOX} className={className} width="40" height="13" aria-hidden="true" focusable="false">
      {C4}
    </svg>
  );
}

/** A headshot, drawn beside the weapon rather than written out. */
export function HeadshotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <path d="M8 1.2v1.8M8 13v1.8M1.2 8h1.8M13 8h1.8" />
    </svg>
  );
}
