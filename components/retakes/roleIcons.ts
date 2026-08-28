import {
  Bomb,
  Crosshair,
  DoorOpen,
  Footprints,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per Blitz role.
 *
 * There were three copies of this: a map in the loadout page, another in its
 * map-role bubble, and a run of inline `role === 'sniper' && <Crosshair/>`
 * conditionals in the lobby which silently drew nothing for any role the
 * author had not listed. One map, imported everywhere, cannot drift like that.
 *
 * The ids follow the mode now (lib/tournament/roles.ts), so the three that were
 * here and are not in the game — lurker, anchor, rotator — are gone with the
 * role list that invented them.
 *
 * Lucide rather than the hand-drawn set, which is the existing rule of thumb.
 * The match page draws its own SVGs for these seven at 14px inside a dense
 * panel; this is the lobby, where the surrounding iconography is lucide and a
 * different weight would read as a different kind of thing.
 */
export const ROLE_ICON: Record<string, LucideIcon> = {
  // T
  planter: Bomb,
  sniper: Crosshair,
  rifler: Target,
  // CT
  roamer: Footprints,
  frontrunner: DoorOpen,
  awper: Crosshair,
  backup: Users,
};
