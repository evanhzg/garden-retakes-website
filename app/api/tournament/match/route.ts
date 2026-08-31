import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { queueState } from "@/lib/tournament/queue";
import { background } from "@/lib/background";
import { startMatch } from "@/lib/tournament/matchRunner";
import { execOnServer } from "@/lib/tournament/servers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One match's detail, for the modal a bracket box opens.
//
// The connect string is the reason this is a route rather than data baked into
// the bracket. A bracket holds forty boxes; sending a server address for every
// one of them, to every viewer, so that one of them might be clicked, would be
// both wasteful and the wrong permission model. It is fetched per match, and
// only for somebody entitled to it.

/**
 * When each match was last checked against its server, so this does not run an
 * RCON round trip on every poll of every open match page.
 *
 * Module scope, which on a serverless host means per instance and not global.
 * That is fine: the check is idempotent and cheap to repeat occasionally — the
 * point is to stop one viewer's ten-second poll turning into ten-second RCON
 * traffic, not to guarantee exactly-once.
 */
const lastReconciled = new Map<number, number>();
const RECONCILE_EVERY_MS = 60_000;

/**
 * Notices a match whose server has forgotten it, and restarts it.
 *
 * A game server that restarts — a deploy, a crash, an admin — comes back empty
 * while the row still says "live". Nothing then reconciled the two: the plugin
 * had never heard of the match and the website would not restart it because it
 * believed it was already running. The match sat live nowhere until somebody
 * edited the database, which happened three times in one evening of deploys.
 *
 * Runs from the match page's own poll because that is exactly when somebody is
 * looking at a match and wondering why nothing is happening. startMatch does
 * the real work and is safe to call: it re-claims the server, cancels and
 * resets whatever the plugin still believes, and refuses outright if the server
 * turns out to be running this match after all.
 */
async function reconcileWithServer(match: {
  Id: number;
  State: string;
  ServerId: number | null;
  MatchKey: string | null;
}) {
  if (!match.ServerId) return;

  /**
   * LIVE ONLY. "ready" is not a match that has been forgotten — it is a match
   * that is being started RIGHT NOW.
   *
   * startMatch sets "ready" as its first act, then loads the map, waits for it,
   * cancels whatever the server was doing and hands over the rosters. That is
   * many seconds long, and for every one of them the plugin correctly answers
   * that no match is live, because none is yet.
   *
   * This used to reconcile "ready" as well, so a poll landing inside that
   * window read a correct "not live" as amnesia and fired a SECOND startMatch
   * alongside the first. The two raced; whichever lost threw, and its catch
   * releases the server and writes ServerId null. That is exactly the reported
   * "it gives a server and a few seconds later says there is none", including
   * when the server was assigned by hand from the admin panel.
   *
   * A live match is the only one where "the plugin has never heard of this" is
   * genuinely wrong, and it is the case this was written for: a server that
   * restarted mid-match and came back empty.
   */
  if (match.State !== "live") return;

  const now = Date.now();
  const last = lastReconciled.get(match.Id) ?? 0;
  if (now - last < RECONCILE_EVERY_MS) return;
  lastReconciled.set(match.Id, now);

  let plugin: string;
  try {
    plugin = await execOnServer(match.ServerId, "css_t_status");
  } catch {
    // A server that cannot be reached is not a server that has lost the match.
    return;
  }

  const stillOurs =
    /live=yes/i.test(plugin) && (!match.MatchKey || plugin.includes(match.MatchKey));

  if (stillOurs) return;

  background(`match:reconcile:${match.Id}`, () => startMatch(match.Id));
}

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

  // Checked here rather than on a timer, because a stale match is only a
  // problem while somebody is waiting for it — and somebody waiting for it is
  // exactly who is polling this route.
  if (match) {
    background(`match:check:${match.Id}`, () => reconcileWithServer(match));
  }

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

  // Which server, by name, for everybody — not only for people allowed to join
  // it. "T3" is not an address and leaks nothing; it is the difference between
  // a page that says a match is being set up somewhere and one that says where.
  let serverName: string | null = null;

  if (match.ServerId !== null) {
    const named = await prisma.gameServer.findUnique({
      where: { Id: match.ServerId },
      select: { Name: true },
    });
    serverName = named?.Name ?? null;
  }

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

  // Where it stands in the line for a server, so the page can say "waiting,
  // second of five" rather than showing nothing and looking stuck.
  const queue = await queueState(matchId);

  return NextResponse.json({
    canSpectate,
    gotv,
    state: match.State,
    serverIsUp,
    serverName,
    queue,
    connect,
    maps: match.Maps.map((m) => ({
      map: m.Map,
      scoreA: m.ScoreA,
      scoreB: m.ScoreB,
      startSideTeamA: m.StartSideTeamA,
    })),
  });
}
