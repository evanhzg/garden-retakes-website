import { prisma } from "@/lib/db";
import { getAdminContext, type AdminContext } from "@/lib/adminAuth";
import {
  canCreateTournament,
  canManageTournament,
  canEditOrganizerRegistry,
  managesEverything,
  tournamentRoleName,
  type TournamentActor,
} from "@/lib/tournamentRoles";

// The database half of the organizer system. The decisions themselves are in
// lib/tournamentRoles.ts, which has no imports and is where they are tested;
// this only fetches the three facts those decisions are made from.

export type TournamentContext = AdminContext & {
  isOrganizer: boolean;
  canCreate: boolean;
  /** Owner | Admin | Organizer | None — what to show on a badge. */
  roleName: string;
};

const actorOf = (ctx: TournamentContext): TournamentActor => ({
  adminLevel: ctx.level,
  steamId: ctx.steamId,
  isOrganizer: ctx.isOrganizer,
  viaKey: ctx.viaKey,
});

/** Is this SteamID in the global organizer registry? */
export async function isRegisteredOrganizer(steamId: string | null | undefined): Promise<boolean> {
  if (!steamId) return false;
  try {
    const row = await prisma.gardenOrganizer.findUnique({ where: { SteamId: BigInt(steamId) } });
    return row !== null;
  } catch {
    // Refusing is the safe direction: a gate that cannot establish standing
    // grants nothing.
    return false;
  }
}

/** The admin context, plus whether the caller is a registered organizer. */
export async function getTournamentContext(key?: string | null): Promise<TournamentContext> {
  const ctx = await getAdminContext(key);
  const isOrganizer = await isRegisteredOrganizer(ctx.steamId);

  const withRole: TournamentContext = { ...ctx, isOrganizer, canCreate: false, roleName: "None" };
  withRole.canCreate = canCreateTournament(actorOf(withRole));
  withRole.roleName = tournamentRoleName(actorOf(withRole));

  return withRole;
}

/** The organizer SteamIDs named on one tournament. */
export async function organizersOf(tournamentId: number): Promise<string[]> {
  try {
    const rows = await prisma.tournamentOrganizer.findMany({
      where: { TournamentId: tournamentId },
      select: { SteamId: true },
    });
    return rows.map((r) => r.SteamId.toString());
  } catch {
    return [];
  }
}

/**
 * May this caller edit this tournament?
 *
 * Takes the id rather than the row so callers cannot forget to load the
 * organizer list — the one mistake that would silently grant access to
 * everybody, since an empty list looks the same as "not an organizer".
 */
export async function canManage(ctx: TournamentContext, tournamentId: number): Promise<boolean> {
  if (managesEverything(actorOf(ctx))) return true;
  return canManageTournament(actorOf(ctx), await organizersOf(tournamentId));
}

/** May this caller change the global organizer registry? */
export function canEditRegistry(ctx: TournamentContext): boolean {
  return canEditOrganizerRegistry(actorOf(ctx));
}

/** Every tournament id this caller may manage, or null meaning "all of them". */
export async function manageableTournamentIds(ctx: TournamentContext): Promise<number[] | null> {
  if (managesEverything(actorOf(ctx))) return null;
  if (!ctx.steamId) return [];

  try {
    const rows = await prisma.tournamentOrganizer.findMany({
      where: { SteamId: BigInt(ctx.steamId) },
      select: { TournamentId: true },
    });
    return rows.map((r) => r.TournamentId);
  } catch {
    return [];
  }
}
