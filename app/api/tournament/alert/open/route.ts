import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { ackAlert } from "@/lib/tournament/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The link in an organizer's Discord DM.
 *
 * It acknowledges the alert and then sends them to the match, which is the
 * whole point: somebody who has opened the call is on their way to it, and the
 * other three organizers should stop being told about it. Requiring them to
 * also find the button on the page afterwards is how two people end up walking
 * to the same problem.
 *
 * A GET with a side effect, which is normally worth avoiding — but this is a
 * link in a chat client and it cannot be anything else. The side effect is
 * idempotent (ackAlert only ever fires on an alert that is still open) and it
 * is the one the person clicking intends, which is the case the rule exists to
 * protect.
 *
 * Acknowledging is gated on actually being an organizer, which also handles the
 * thing that would otherwise break this: Discord fetches every link it is shown
 * in order to build a preview. That crawler has no session, so it fails the
 * check and acks nothing — the alert is still open when the human reads the
 * message. The same gate means a forwarded link changes nothing in a stranger's
 * hands.
 */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const home = new URL("/tournaments", req.nextUrl.origin);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.redirect(home);
  }

  const alert = await prisma.tournamentAlert.findUnique({ where: { Id: id } });
  if (!alert) return NextResponse.redirect(home);

  // Where it points, whether or not the click counts as handling it.
  let target = home;
  if (alert.MatchId && alert.TournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { Id: alert.TournamentId },
      select: { Slug: true },
    });
    if (tournament?.Slug) {
      target = new URL(
        `/tournaments/${tournament.Slug}/match/${alert.MatchId}`,
        req.nextUrl.origin,
      );
    }
  }

  const session = await getSession();
  const steamId = session?.steamId ? String(session.steamId) : null;

  if (steamId && alert.TournamentId) {
    const ctx = await getTournamentContext(null);
    if (await canManage(ctx, alert.TournamentId)) {
      await ackAlert(id, steamId);
    }
  }

  // Not cached, ever. A browser that remembers this redirect would ack the next
  // alert without asking the server, and a chat client that pre-fetches links
  // would ack them all before anybody read the message.
  const res = NextResponse.redirect(target);
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
