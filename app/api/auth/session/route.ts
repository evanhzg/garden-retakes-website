import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRegisteredOrganizer } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ authenticated: false });

  // Expose the admin level so the NavBar can reveal the Admin link.
  let adminLevel = 0;
  try {
    const row = await prisma.gardenAdmin.findUnique({
      where: { SteamId: BigInt(session.steamId) },
      select: { Level: true },
    });
    adminLevel = row?.Level ?? 0;
  } catch {
    // DB unreachable — treat as non-admin for the nav.
  }

  /**
   * Whether they run events, which is not the same as being an admin.
   *
   * The two grants are separate all the way down — an organizer with no admin
   * level at all can open the Blitz panel, and a site admin who runs nothing
   * still sees it. The rail needs both to decide which shortcuts to draw, and
   * asking here means it asks once rather than per render.
   *
   * Counted rather than fetched: the answer is a boolean and the row can be
   * large.
   */
  let isOrganizer = false;
  try {
    // isRegisteredOrganizer is the site's own answer to this and already
    // handles the unreachable case by refusing. Asking it rather than querying
    // the table keeps one definition of "organizer" — the registry is
    // gardenOrganizer, which is not a name anybody would guess from
    // TournamentOrganizer sitting next to it.
    const [registered, named] = await Promise.all([
      isRegisteredOrganizer(session.steamId),
      prisma.tournamentOrganizer.count({ where: { SteamId: BigInt(session.steamId) } }),
    ]);
    isOrganizer = registered || named > 0;
  } catch {
    // Same as the admin level above: unreachable means "no extra shortcuts",
    // never a broken nav.
  }

  return NextResponse.json({
    authenticated: true,
    steamId: session.steamId,
    name: session.name ?? null,
    avatar: session.avatar ?? null,
    adminLevel,
    isOrganizer,
  });
}
