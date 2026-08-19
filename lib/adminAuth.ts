import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AdminLevel, canTargetLevel, levelName } from "@/lib/adminImmunity";

// W2: admin panel authorization. Two ways to be an admin on the website:
//   1. A request carries ?key=<ADMIN_KEY> (fallback INVSIM_API_KEY) — same
//      model as /admin-log, and grants Owner-level access (superuser).
//   2. The logged-in Steam session's SteamID64 is in the GardenAdmins table
//      (shared with the plugin) — access is capped at that stored level.
// Levels mirror the plugin's AdminRegistry.AdminLevel: Moderator < Admin < Owner.

// Re-exported so the 27 routes importing them from here keep working.
export { AdminLevel, levelName, canTargetLevel } from "@/lib/adminImmunity";
export type { AdminLevelValue } from "@/lib/adminImmunity";

/** Legacy key check (kept for the hidden key-protected pages like /admin-log). */
export function isAdminKey(key: string | null | undefined): boolean {
  const expected = process.env.ADMIN_KEY || process.env.INVSIM_API_KEY;
  return Boolean(expected && key && key === expected);
}

export type AdminContext = {
  level: number;
  /** SteamID64 of the acting admin, or null when authorized purely by key. */
  steamId: string | null;
  name: string;
  viaKey: boolean;
};

/**
 * Resolve the caller's admin context from (in priority) a superuser key, then
 * the logged-in session's GardenAdmins level. `key` is optional — pass the
 * request's ?key= when supporting the key path.
 */
export async function getAdminContext(key?: string | null): Promise<AdminContext> {
  if (isAdminKey(key)) {
    return { level: AdminLevel.Owner, steamId: null, name: "Web Key", viaKey: true };
  }

  const session = getSession();
  if (session) {
    try {
      const row = await prisma.gardenAdmin.findUnique({
        where: { SteamId: BigInt(session.steamId) },
      });
      if (row) {
        return {
          level: row.Level,
          steamId: session.steamId,
          name: session.name ?? row.Name,
          viaKey: false,
        };
      }
    } catch {
      // DB unreachable — fall through to unauthorized.
    }
  }

  return { level: AdminLevel.None, steamId: session?.steamId ?? null, name: session?.name ?? "", viaKey: false };
}

/** The admin level stored for a SteamID, or None if they are not an admin. */
export async function levelOf(steamId: string | bigint | null | undefined): Promise<number> {
  if (!steamId) return AdminLevel.None;
  try {
    const row = await prisma.gardenAdmin.findUnique({ where: { SteamId: BigInt(steamId) } });
    return row?.Level ?? AdminLevel.None;
  } catch {
    // DB unreachable. Refusing is the safe direction: a command that cannot
    // establish the target outranks nobody.
    return AdminLevel.Owner;
  }
}

/**
 * The immunity gate for the web admin API.
 *
 * This did not exist. Every route checked the actor's level against the
 * *command* (`ctx.level < REQUIRED[type]`) and nothing compared them against
 * the *person*, so a Moderator could kick or slay an Owner through the website
 * — the same hole the plugin had until AdminTargeting.CanTarget closed it.
 *
 * It cannot be caught further down either. Commands reach the game server over
 * RCON, which has no player identity, so the plugin sees console and treats it
 * as Owner: its own gate never refuses anything the website sends. This is the
 * only place the check can happen.
 */
export async function canTarget(
  ctx: AdminContext,
  targetSteamId: string | bigint | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!targetSteamId) return { ok: true };

  const target = String(targetSteamId);
  const isSelf = ctx.steamId !== null && ctx.steamId === target;
  const targetLevel = await levelOf(target);

  if (canTargetLevel(ctx.level, targetLevel, isSelf)) return { ok: true };

  // Naming the rank rather than saying "not authorized": an admin told the
  // latter tries again, and one told the target outranks them does not.
  return { ok: false, error: `That player is ${levelName(targetLevel)} and outranks you.` };
}

/**
 * The same gate, for the commands that target by display name.
 *
 * kick and slay send a name to the plugin, which matches it as a substring
 * against online players. So the gate has to ask the same question the plugin
 * will: could this string select an admin? Any admin whose name contains the
 * given text — or is contained by it — is a possible match, and the highest
 * level among them is what the actor has to outrank.
 *
 * Deliberately pessimistic. A name is ambiguous, and the safe direction for an
 * ambiguous command aimed at an Owner is to refuse it.
 */
export async function canTargetByName(
  ctx: AdminContext,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const needle = name.trim().toLowerCase();
  if (!needle) return { ok: true };

  let admins: { SteamId: bigint; Name: string; Level: number }[];
  try {
    admins = await prisma.gardenAdmin.findMany({ select: { SteamId: true, Name: true, Level: true } });
  } catch {
    return { ok: false, error: "Could not check permissions — try again." };
  }

  let highest: number = AdminLevel.None;
  for (const admin of admins) {
    const theirs = (admin.Name ?? "").toLowerCase();
    if (!theirs) continue;
    if (ctx.steamId && admin.SteamId.toString() === ctx.steamId) continue;
    if (theirs.includes(needle) || needle.includes(theirs)) {
      highest = Math.max(highest, admin.Level);
    }
  }

  if (canTargetLevel(ctx.level, highest)) return { ok: true };

  return {
    ok: false,
    error: `“${name}” could match ${levelName(highest)}, who outranks you. Use their SteamID to be specific.`,
  };
}

/** Write one row to the shared GardenAdminLog audit trail (best-effort). */
export async function logAdminAction(
  ctx: AdminContext,
  action: string,
  target?: { steamId?: string | bigint | null; name?: string | null },
  detail = ""
): Promise<void> {
  try {
    await prisma.gardenAdminLogEntry.create({
      data: {
        AtUtc: new Date(),
        ActorSteamId: ctx.steamId ? BigInt(ctx.steamId) : BigInt(0),
        ActorName: ctx.viaKey ? "Web Key" : ctx.name || "Web",
        Action: action,
        TargetSteamId: target?.steamId ? BigInt(target.steamId) : BigInt(0),
        TargetName: target?.name ?? "",
        Detail: detail,
      },
    });
  } catch {
    // Audit logging is best-effort; never block the action on a log failure.
  }
}
