import { prisma } from "@/lib/db";

/**
 * Telling an org's followers that something is happening.
 *
 * Three moments, which is what following is FOR: a tournament is published, it
 * is about to start, and it has started. Anything more than those and the
 * notification becomes something people turn off, which costs them the two they
 * actually wanted.
 *
 * Written straight into WebNotifications, the site's existing notification
 * centre, rather than a second inbox nobody would think to look in.
 */

export type OrgEvent = "published" | "soon" | "started";

const LINE: Record<OrgEvent, (org: string, tournament: string) => string> = {
  published: (org, t) => `${org} announced ${t}`,
  soon: (org, t) => `${t} by ${org} starts soon`,
  started: (org, t) => `${t} by ${org} has started`,
};

/**
 * Notifies every follower of the org that runs this tournament.
 *
 * Returns the number notified, which is only useful for logging — nothing
 * should branch on it. A tournament with no followers is the normal case for a
 * new org and is not a failure.
 *
 * Deliberately never throws into its caller. Publishing a tournament must not
 * fail because a notification could not be written; the tournament is the
 * thing, and the announcement is a courtesy on top of it.
 */
export async function notifyFollowers(tournamentId: number, event: OrgEvent): Promise<number> {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { Id: tournamentId },
      select: { Name: true, Slug: true, OrgId: true },
    });

    if (!tournament?.OrgId) return 0;

    const org = await prisma.gardenOrg.findUnique({
      where: { Id: tournament.OrgId },
      select: { Name: true },
    });
    if (!org) return 0;

    const followers = await prisma.gardenOrgFollow.findMany({
      where: { OrgId: tournament.OrgId },
      select: { SteamId: true },
    });
    if (followers.length === 0) return 0;

    const content = LINE[event](org.Name, tournament.Name).slice(0, 256);
    const actionUrl = `/tournaments/${tournament.Slug}`;

    // createMany rather than a loop: a popular org is thousands of rows and a
    // round trip each would make publishing a tournament take a visible
    // fraction of a minute.
    await prisma.webNotification.createMany({
      data: followers.map((f) => ({
        SteamId: f.SteamId,
        Type: `ORG_${event.toUpperCase()}`,
        Content: content,
        ActionUrl: actionUrl,
      })),
    });

    // The bell updates without a reload for anybody with the page open.
    try {
      const io = (globalThis as { __gardenIo?: { emit: (e: string, p: unknown) => void } }).__gardenIo;
      for (const f of followers) {
        io?.emit("notification", { SteamId: f.SteamId.toString(), Type: `ORG_${event.toUpperCase()}` });
      }
    } catch {
      /* the poll will catch it */
    }

    return followers.length;
  } catch {
    // A tournament that published but could not announce itself is a smaller
    // problem than one that failed to publish.
    return 0;
  }
}
