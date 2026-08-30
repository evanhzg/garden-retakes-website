import {
  Bomb,
  Cloud,
  Crosshair,
  Flame,
  Shield,
  Swords,
  Target,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per tournament role, for every place a role is drawn.
 *
 * There were three sets: this lucide map (the lobby and the loadout), a
 * hand-drawn SVG set in components/tournament/RoleIcon.tsx (the match page),
 * and a third list inline in the homepage. Three sets meant a role could be a
 * bomb in one place and a crosshair in another, and adding a role meant
 * remembering all three — which is exactly how the homepage ended up still
 * calling the roamer non-unique long after it became unique.
 *
 * This is the homepage's set, kept because it was the best of the three, and it
 * is now the only one. Lucide rather than hand-drawn: the surrounding
 * iconography is lucide everywhere these appear, they take currentColor, and
 * they hold up at the 14px the match page draws them at.
 *
 * The two sniper roles share a mark on purpose. They are the same job on
 * opposite sides — which is the whole reason the CT one stopped being called
 * AWPer — and giving them different drawings would undo that in pictures.
 */
export const ROLE_ICON: Record<string, LucideIcon> = {
  // T
  planter: Bomb,
  sniper: Target,
  // The crosshair the roamer used to hold: the rifler is the T side's duellist,
  // and a reticle is the plainest way to say "this one just shoots".
  rifler: Crosshair,
  // The flame the rifler used to hold, which was always a strange fit for a
  // role defined by not carrying utility. It belongs to the role that owns the
  // molotov.
  burner: Flame,
  // CT
  // A cloud, not a footprint or a reticle. The roamer is the one player free to
  // be somewhere else, and drifting is the shape of that.
  roamer: Cloud,
  frontrunner: Swords,
  awper: Target,
  backup: Shield,
};
