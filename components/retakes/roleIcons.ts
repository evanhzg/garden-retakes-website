import { Crosshair, Ghost, Target, Anchor, RotateCcw, type LucideIcon } from "lucide-react";

/**
 * One icon per retake role.
 *
 * There were three copies of this: a map in the loadout page, another in its
 * map-role bubble, and a run of inline `role === 'sniper' && <Crosshair/>`
 * conditionals in the lobby which silently drew nothing for any role the
 * author had not listed — the lobby's T column had no case for `anchor` and
 * its CT column none for `lurker`, so a role picked on one screen could vanish
 * on the other. One map, imported everywhere, cannot drift like that.
 *
 * Lucide rather than the hand-drawn set: nothing in that set covers these five
 * jobs, which is the existing rule of thumb for when to fall back.
 */
export const ROLE_ICON: Record<string, LucideIcon> = {
  sniper: Crosshair,
  lurker: Ghost,
  rifler: Target,
  anchor: Anchor,
  rotator: RotateCcw,
};
