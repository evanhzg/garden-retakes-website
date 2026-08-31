import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isPickupSlug } from "@/lib/tournament/pickup";
import { getTournamentContext } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The tournaments worth showing this viewer in the social rail.
 *
 * Two sets, unioned: the ones they are IN — a team they play for, or one they
 * organise — and the ones that are running right now and public. The first is
 * "where do I have to be"; the second is "what is on". A rail listing every
 * tournament that has ever existed would be a directory, and there is a page
 * for that.
 *
 * NEVER selects the image bytes. lib/tournament/orgs.ts learned this the hard
 * way and says so at OrgCard: a list of forty rows with a MEDIUMBLOB in each
 * drags forty images through one connection to draw forty thirty-pixel
 * circles. The bytes come from /api/tournaments/[slug]/avatar, one request per
 * image, cached — which is what a browser is good at.
 */
export async function GET() {
  const session = getSession();
  const steamId = session?.steamId ? String(session.steamId) : null;

  const card = {
    Id: true,
    Slug: true,
    Name: true,
    State: true,
    StartedAt: true,
    AvatarMime: true,
  } as const;

  // What is on, for everybody. Published only: an unpublished tournament is
  // unlisted by definition, and pickups hang off one — so a rail without this
  // filter would show every lobby game anybody had ever played.
  const running = await prisma.tournament.findMany({
    where: { Published: true, State: "live" },
    orderBy: { StartedAt: "desc" },
    take: 12,
    select: card,
  });

  if (!steamId) {
    return NextResponse.json({ tournaments: shape(running), canCreate: false });
  }

  const id = BigInt(steamId);

  // Whether to draw the create button, answered here rather than by a second
  // endpoint the rail would have to call alongside this one. It is the same
  // question about the same viewer, and two requests to learn one screen's
  // worth of state is one too many.
  const ctx = await getTournamentContext();

  // Mine: a team I am on, or an event I run. Two queries rather than one with
  // an OR across a join, because the two have nothing in common but the answer.
  const [viaTeam, viaOrganiser] = await Promise.all([
    prisma.tournamentTeamMember.findMany({
      where: { SteamId: id, Status: { not: "removed" } },
      select: { Team: { select: { TournamentId: true } } },
    }),
    prisma.tournamentOrganizer.findMany({
      where: { SteamId: id },
      select: { TournamentId: true },
    }),
  ]);

  // De-duplicated without spreading a Set: this project's ES target predates
  // that, and it is the third time it has been hit. Array.from is the same
  // thing and compiles.
  const mineIds = Array.from(
    new Set([
      ...viaTeam.map((m) => m.Team?.TournamentId).filter((x): x is number => typeof x === "number"),
      ...viaOrganiser.map((o) => o.TournamentId),
    ]),
  );

  const mine = mineIds.length
    ? await prisma.tournament.findMany({
        where: { Id: { in: mineIds } },
        orderBy: { StartedAt: "desc" },
        select: card,
      })
    : [];

  // Mine first, then what is on, with no repeats. A tournament I am playing in
  // that is also live should appear once, at the top.
  const seen = new Set<number>();
  const merged = [...mine, ...running].filter((x) => {
    if (seen.has(x.Id)) return false;
    seen.add(x.Id);
    return true;
  });

  return NextResponse.json({ tournaments: shape(merged), canCreate: ctx.canCreate });
}

function shape(rows: {
  Id: number;
  Slug: string;
  Name: string;
  State: string;
  StartedAt: Date | null;
  AvatarMime: string | null;
}[]) {
  return (
    rows
      // The hidden pickup tournaments are an implementation detail — "Pickup
      // 2v2" is not an event anybody wants pinned to their rail.
      .filter((x) => !isPickupSlug(x.Slug))
      .map((x) => ({
        id: x.Id,
        slug: x.Slug,
        name: x.Name,
        state: x.State,
        live: x.State === "live",
        hasAvatar: x.AvatarMime !== null,
      }))
  );
}
