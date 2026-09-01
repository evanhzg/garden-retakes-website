import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveNames } from "@/lib/names";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// People you have actually played with, who are not your friends yet.
//
// The add-a-friend box asks for a SteamID64 or a nickname, which is a fine way
// to add somebody whose id you already have and a hopeless one otherwise — the
// people most worth adding are the ones you were on a server with last night,
// and their id is the one thing you do not know.
//
// Ranked by how often, because playing with somebody once is a coincidence and
// playing with them five times is a reason.

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ suggestions: [] });

  const me = BigInt(session.steamId);

  try {
    // Tournament rosters are the strongest signal: those are declared teams
    // rather than whoever happened to be on a public server.
    const myEntries = await prisma.tournamentTeamMember.findMany({
      where: { SteamId: me, Status: { not: "removed" } },
      select: { TeamId: true },
      take: 100,
    });

    const teamIds = myEntries.map((e) => e.TeamId);

    const together = teamIds.length
      ? await prisma.tournamentTeamMember.findMany({
          where: { TeamId: { in: teamIds }, SteamId: { not: me }, Status: { not: "removed" } },
          select: { SteamId: true },
        })
      : [];

    // Already friends, or already asked. Neither is a suggestion — and a
    // pending request counts, or the list would keep offering somebody who has
    // simply not answered yet.
    const known = await prisma.webFriendship.findMany({
      where: { OR: [{ RequesterId: me }, { AddresseeId: me }] },
      select: { RequesterId: true, AddresseeId: true },
    });

    /**
     * Staff, who appear in the friends list without being friends.
     *
     * /api/friends injects every GardenAdmin into the list as a default
     * contact — a real row on screen with a synthetic negative id and no
     * WebFriendship behind it. So the query above, which is the only place
     * "already a friend" is decided, cannot see them: they showed in the
     * friends list AND in the suggestions to add as a friend, at the same
     * time, in the same panel.
     *
     * The two lists have to agree about who is already there, so this asks the
     * same question the other one answers.
     */
    const staff = await prisma.gardenAdmin.findMany({ select: { SteamId: true } });

    const exclude = new Set<string>([session.steamId]);
    for (const k of known) {
      exclude.add(k.RequesterId.toString());
      exclude.add(k.AddresseeId.toString());
    }
    for (const a of staff) exclude.add(a.SteamId.toString());

    const counts = new Map<string, number>();
    for (const row of together) {
      const id = row.SteamId.toString();
      if (exclude.has(id)) continue;
      // Bots share rosters and are not people. The synthetic range is
      // 76561999…, far above anything Valve has issued.
      if (id.startsWith("76561999")) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const ranked = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (ranked.length === 0) return NextResponse.json({ suggestions: [] });

    const names = await resolveNames(ranked.map(([id]) => id));

    return NextResponse.json({
      suggestions: ranked.map(([steamId, times]) => ({
        steamId,
        name: names.get(steamId) ?? steamId,
        times,
      })),
    });
  } catch {
    // A suggestion list is a convenience. If it cannot be built the box below
    // it still works, so this fails quietly rather than breaking the tab.
    return NextResponse.json({ suggestions: [] });
  }
}
