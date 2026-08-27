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
  let gotv: string | null = null;

  /**
   * Offered whenever there is a server to join, not only while State is "live".
   *
   * That was the bug: startMatch claims a server and sets "ready", loads the
   * map, and only then flips to "live" — and finishMap puts a series back to
   * "ready" between maps. So the window where a spectate button appeared was
   * narrow, and closed again after every map. Anybody who looked during the map
   * load, or between maps, saw no way in.
   *
   * A server is either assigned to this match or it is not. If it is, and this
   * viewer may spectate, they get the address.
   */
  // "ready" is a map loading, "live" is a match in progress. Those are the two
  // states that legitimately hold a server. Anything else with a ServerId is a
  // leftover — a match that was reset, or one whose server was released — and
  // offering a spectate button for it sends people to an empty server or, worse,
  // to somebody else's match.
  const serverIsUp = match.ServerId !== null && (match.State === "ready" || match.State === "live");

  if (canSpectate && serverIsUp) {
    const server = await prisma.gameServer.findUnique({
      where: { Id: match.ServerId! },
      select: { Host: true, Port: true, ConnectAddress: true, GotvAddress: true },
    });

    if (server) {
      connect = server.ConnectAddress?.trim() || `${server.Host}:${server.Port}`;
      // GOTV when the organizer has set one. It is the better way to watch a
      // competitive match — no slot taken, no chance of walking into a live
      // round — so it is offered alongside rather than instead.
      gotv = server.GotvAddress?.trim() || null;
    }
  }

  return NextResponse.json({
    canSpectate,
    gotv,
    state: match.State,
    serverIsUp,
    connect,
    maps: match.Maps.map((m) => ({
      map: m.Map,
      scoreA: m.ScoreA,
      scoreB: m.ScoreB,
      startSideTeamA: m.StartSideTeamA,
    })),
  });
}
