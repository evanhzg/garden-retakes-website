import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// W2: admin panel authorization. Two ways to be an admin on the website:
//   1. A request carries ?key=<ADMIN_KEY> (fallback INVSIM_API_KEY) — same
//      model as /admin-log, and grants Owner-level access (superuser).
//   2. The logged-in Steam session's SteamID64 is in the GardenAdmins table
//      (shared with the plugin) — access is capped at that stored level.
// Levels mirror the plugin's AdminRegistry.AdminLevel: Moderator < Admin < Owner.

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
