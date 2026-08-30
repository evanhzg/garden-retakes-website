import { prisma } from "@/lib/db";

import type { OrgRole } from "@/lib/tournamentRoles";

/**
 * Organizations: the database half.
 *
 * The decisions about what a role may do live in lib/tournamentRoles.ts, which
 * has no imports and is where they are tested. This only fetches the facts
 * those decisions are made from — the same split the tournament permissions
 * already use.
 */

/** A slug from a name, or null when nothing usable is left of it. */
export function orgSlug(name: string): string | null {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  // A name of nothing but punctuation is not a name. Returning "" would make
  // every such org collide on the unique index and the second one would fail
  // with a database error rather than a sentence.
  return slug.length >= 2 ? slug : null;
}

/**
 * This person's role in the org that runs a tournament, if any.
 *
 * Returns null when the tournament has no org, when the caller is anonymous, or
 * when they are simply not a member — three different situations that all mean
 * "no org role", and none of which should be confused with having one.
 */
export async function orgRoleForTournament(
  steamId: string | null | undefined,
  tournamentId: number,
): Promise<OrgRole | null> {
  if (!steamId) return null;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { Id: tournamentId },
      select: { OrgId: true },
    });
    if (!tournament?.OrgId) return null;

    const member = await prisma.gardenOrgMember.findFirst({
      where: { OrgId: tournament.OrgId, SteamId: BigInt(steamId) },
      select: { Role: true },
    });

    if (!member) return null;
    return member.Role === "organizer" ? "organizer" : "moderator";
  } catch {
    // Refusing is the safe direction, exactly as isRegisteredOrganizer does: a
    // gate that cannot establish standing grants nothing.
    return null;
  }
}

/** Just enough of an org to list it and link to it. */
export type OrgCard = { Id: number; Slug: string; Name: string; ImageMime: string | null };

/**
 * The orgs this person is an ORGANIZER of.
 *
 * Moderators are deliberately absent. A moderator works an event and cannot
 * change what it is, and an org's own settings — who is in it, what it links to
 * — are exactly "what it is".
 *
 * Two queries rather than a relation traversal because GardenOrgMember has no
 * declared relation to GardenOrg; the SteamId index makes the first one cheap
 * and the second is an `IN` over a handful of ids.
 */
export async function orgsOrganizedBy(steamId: string | null | undefined): Promise<OrgCard[]> {
  if (!steamId) return [];

  try {
    const memberships = await prisma.gardenOrgMember.findMany({
      where: { SteamId: BigInt(steamId), Role: "organizer" },
      select: { OrgId: true },
    });
    if (memberships.length === 0) return [];

    return await listOrgs({ Id: { in: memberships.map((m) => m.OrgId) } });
  } catch {
    // Same direction as orgRoleForTournament: a lookup that cannot establish
    // standing grants nothing.
    return [];
  }
}

/**
 * Orgs for a listing, without their images.
 *
 * The bytes are a LongBlob on the row and are served by their own route, so
 * selecting the whole record to print a name would pull every logo in the
 * database through the connection to render a list of links.
 */
export function listOrgs(where?: { Id?: { in: number[] } }): Promise<OrgCard[]> {
  return prisma.gardenOrg.findMany({
    where,
    orderBy: { Name: "asc" },
    select: { Id: true, Slug: true, Name: true, ImageMime: true },
  });
}

/** Everybody in an org, organizers first. */
export async function membersOf(orgId: number) {
  return prisma.gardenOrgMember.findMany({
    where: { OrgId: orgId },
    // Organizers before moderators, then oldest first — which is the order they
    // joined and the order that reads as a team rather than a set.
    orderBy: [{ Role: "asc" }, { AddedAt: "asc" }],
  });
}

/**
 * The people a new tournament should name as its organizers.
 *
 * Only the org's ORGANIZERS. Moderators are granted their access through the
 * org role instead, and writing them onto the tournament's own organizer list
 * would silently promote them: that list is what canManageTournament reads, and
 * everything on it can edit the bracket.
 */
export async function organizerSteamIdsOf(orgId: number): Promise<string[]> {
  const rows = await prisma.gardenOrgMember.findMany({
    where: { OrgId: orgId, Role: "organizer" },
    select: { SteamId: true },
  });
  return rows.map((r) => r.SteamId.toString());
}

/** Tournaments an org has run, is running, and will run. */
export async function tournamentsOf(orgId: number) {
  const all = await prisma.tournament.findMany({
    where: { OrgId: orgId },
    orderBy: { StartsAt: "desc" },
  });

  const now = Date.now();

  const live: typeof all = [];
  const upcoming: typeof all = [];
  const past: typeof all = [];

  for (const t of all) {
    // The state the tournament itself claims, not a date range: an event that
    // started late is still not live, and one that overran is. The vocabulary
    // is draft | registration | live | finished — anything else is treated as
    // not-yet, which is the safe way to be wrong about a state added later.
    if (t.State === "live") live.push(t);
    else if (t.State === "finished") past.push(t);
    // A draft whose date has been and gone is over, whatever the row says.
    // Nobody goes back and marks these finished, and listing a tournament from
    // last spring under "upcoming" is the kind of thing that makes a page look
    // abandoned.
    else if (t.StartsAt && t.StartsAt.getTime() < now) past.push(t);
    else upcoming.push(t);
  }

  // Upcoming reads soonest-first; the other two newest-first.
  upcoming.reverse();

  return { live, upcoming, past };
}
