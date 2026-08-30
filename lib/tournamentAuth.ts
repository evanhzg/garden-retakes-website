import { prisma } from "@/lib/db";
import { getAdminContext, type AdminContext } from "@/lib/adminAuth";
import { orgRoleForTournament, orgsOrganizedBy } from "@/lib/tournament/orgs";
import {
  canCreateTournament,
  canManageTournament,
  canModerateTournament,
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

  const organizers = await organizersOf(tournamentId);
  if (canManageTournament(actorOf(ctx), organizers)) return true;

  // An org's organizers manage its tournaments even if they are not named on
  // this one. Creating a tournament writes them onto it, so this is normally
  // redundant — but somebody added to the org afterwards would otherwise be
  // locked out of events their own org is running, which reads as the role not
  // working.
  return (await orgRoleForTournament(ctx.steamId, tournamentId)) === "organizer";
}

/**
 * May this caller INTERVENE in this tournament without being able to change
 * what it is?
 *
 * Tickets, admin calls, fixing a score, restarting a match, messaging players.
 * Everybody who canManage can also moderate; on top of them, the moderators of
 * the org that runs it.
 *
 * Asked separately from canManage on purpose. The two protect different things
 * — one guards the bracket, the other guards the match — and a single boolean
 * is how a moderator ends up able to delete a stage.
 *
 * The org role is fetched HERE rather than being carried on the context,
 * because it is per tournament: somebody can be a moderator for one org and
 * nothing at all for another, and a role cached on a request would be the wrong
 * answer as soon as it was asked about a second event.
 */
export async function canModerate(ctx: TournamentContext, tournamentId: number): Promise<boolean> {
  if (managesEverything(actorOf(ctx))) return true;

  const orgRole = await orgRoleForTournament(ctx.steamId, tournamentId);
  return canModerateTournament(
    { ...actorOf(ctx), orgRole },
    await organizersOf(tournamentId),
  );
}

/**
 * May this caller reach the organization tools?
 *
 * Admin and above always, because creating an org is a site-wide act — an org
 * grants tournament permissions to everybody in it. Below that, the people who
 * already hold the `organizer` role in one: they run it, and until now the only
 * way to their own org's page was to know its slug.
 *
 * No new rule. `managesEverything` is the same predicate every other tournament
 * gate opens on, and the org role is read exactly as canModerate reads it.
 */
export async function canUseOrgs(ctx: TournamentContext): Promise<boolean> {
  if (canCreateOrg(ctx)) return true;
  return (await orgsOrganizedBy(ctx.steamId)).length > 0;
}

/**
 * May this caller MAKE an organization?
 *
 * Narrower than reaching the tools, and deliberately the same answer that
 * app/api/orgs/route.ts gives: an org grants tournament permissions to
 * everybody in it, so who may mint one is answered conservatively. The two must
 * agree or the form is offered to somebody the server will refuse.
 */
export function canCreateOrg(ctx: TournamentContext): boolean {
  return managesEverything(actorOf(ctx));
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
