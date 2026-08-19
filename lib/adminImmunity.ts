/**
 * Who may act on whom, as arithmetic.
 *
 * Deliberately import-free — the same house rule `lib/gameModes.ts` follows and
 * explains. This is the one piece of the admin system that is pure logic, it is
 * the piece most worth testing, and pulling it out of `lib/adminAuth.ts` means
 * checking it does not require a database, a session or Next's `server-only`.
 *
 * It mirrors the plugin's `AdminTargeting.CanTarget` and must keep mirroring
 * it: strictly-higher immunity blocks, equal does not — the SourceMod
 * convention server admins already expect — and acting on yourself is always
 * allowed, so `!slap me` needs no second code path.
 */

export const AdminLevel = {
  None: 0,
  Moderator: 1,
  Admin: 2,
  Owner: 3,
} as const;

export type AdminLevelValue = (typeof AdminLevel)[keyof typeof AdminLevel];

export const levelName = (level: number): string =>
  level >= AdminLevel.Owner
    ? "Owner"
    : level === AdminLevel.Admin
      ? "Admin"
      : level === AdminLevel.Moderator
        ? "Moderator"
        : "None";

export function canTargetLevel(actorLevel: number, targetLevel: number, isSelf = false): boolean {
  return isSelf || targetLevel <= actorLevel;
}
