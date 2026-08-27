import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One match's detail, for the modal a bracket box opens.
//
// The connect string is the reason this is a route rather than data baked into
// the bracket. A bracket holds forty boxes; sending a server address for every
// one of them, to every viewer, so that one of them might be clicked, would be
// both wasteful and the wrong permission model. It is fetched per match, and
// only for somebody entitled to it.

export async function GET(req: Request) {
  const matchId = Number(new URL(req.url).searchParams.get("matchId"));
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "matchId?" }, { status: 400 });
  }

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: {
      Maps: { orderBy: { Ordinal: "asc" } },
      Tournament: { select: { Id: true, Published: true, SpectatorsPublic: true } },
    },
  });

  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  const ctx = await getTournamentContext();
  const isOrganizer = await canManage(ctx, match.TournamentId);

  if (!match.Tournament.Published && !isOrganizer) {
    return NextResponse.json({ error: "No such match." }, { status: 404 });
  }

  const session = getSession();

  /**
   * May this viewer spectate?
   *
   * Organizers always. Everybody else only when the organizer has opened
   * spectating up, or has put this account on the allowlist — which is the
   * same list startMatch() feeds to css_t_spectator, so the website's answer
   * and the server's answer come from one place.
   */
  let canSpectate = isOrganizer || match.Tournament.SpectatorsPublic;

  if (!canSpectate && session) {
    const allowed = await prisma.tournamentSpectator.findFirst({
      where: { TournamentId: match.TournamentId, SteamId: BigInt(session.steamId) },
      select: { Id: true },
    });
    canSpectate = allowed !== null;
  }

  // Only while there is something to watch, and only to somebody allowed to.
  // A connect string for a finished match is an address to an empty server;
  // one sent to a viewer who may not spectate is a leak whatever the UI does
  // with it afterwards.
  let connect: string | null = null;

  if (canSpectate && match.State === "live" && match.ServerId !== null) {
    const server = await prisma.gameServer.findUnique({
      where: { Id: match.ServerId },
      select: { Host: true, Port: true, ConnectAddress: true },
    });

    if (server) {
      connect = server.ConnectAddress?.trim() || `${server.Host}:${server.Port}`;
    }
  }

  return NextResponse.json({
    canSpectate,
    connect,
    maps: match.Maps.map((m) => ({
      map: m.Map,
      scoreA: m.ScoreA,
      scoreB: m.ScoreB,
      startSideTeamA: m.StartSideTeamA,
    })),
  });
}
