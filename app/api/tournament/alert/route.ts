import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { ackAlert, raiseAlert } from "@/lib/tournament/alerts";
import { resolveName } from "@/lib/names";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The organizer's side of admin alerts.
 *
 * Scoped to one tournament, because that is the unit an organizer runs and the
 * unit their permission is granted in. A site-wide list would either leak other
 * people's events or need a second permission model on top of the one that
 * already exists.
 *
 * The plugin has its own route (/api/tournament/admin-call) and keeps it: it
 * authenticates with the shared key rather than a session, and rewriting that
 * seam is a good way to lose calls from the game.
 */

/** Open alerts for a tournament, newest first. */
export async function GET(req: NextRequest) {
  const tournamentId = Number(req.nextUrl.searchParams.get("tournamentId"));
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
    return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
  }

  const ctx = await getTournamentContext(req.nextUrl.searchParams.get("key"));
  if (!(await canManage(ctx, tournamentId))) {
    return NextResponse.json({ alerts: [], canManage: false });
  }

  // Open ones, plus a short tail of handled ones so the modal can show what
  // just happened rather than going blank the moment somebody takes a call.
  const [open, recent] = await Promise.all([
    prisma.tournamentAlert.findMany({
      where: { TournamentId: tournamentId, AckedAt: null },
      orderBy: { CreatedAt: "desc" },
      take: 50,
    }),
    prisma.tournamentAlert.findMany({
      where: { TournamentId: tournamentId, AckedAt: { not: null } },
      orderBy: { AckedAt: "desc" },
      take: 10,
    }),
  ]);

  const tournament = await prisma.tournament.findUnique({
    where: { Id: tournamentId },
    select: { Slug: true },
  });

  const shape = (a: (typeof open)[number]) => ({
    id: a.Id,
    source: a.Source,
    matchId: a.MatchId,
    matchKey: a.MatchKey,
    slug: tournament?.Slug ?? null,
    map: a.Map,
    steamId: a.SteamId.toString(),
    name: a.Name,
    team: a.Team,
    score: a.Score,
    reason: a.Reason,
    at: a.CreatedAt.toISOString(),
    ackedAt: a.AckedAt ? a.AckedAt.toISOString() : null,
  });

  return NextResponse.json({
    canManage: true,
    alerts: open.map(shape),
    recent: recent.map(shape),
  });
}

/**
 * Raise one from the website, or acknowledge one.
 *
 * `call` is the match room's button: anybody in the room may press it, because
 * the people who need an admin are the players, and a button only organizers
 * can press is a button for a problem that has already been noticed.
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; matchId?: number; reason?: string; alertId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const session = await getSession();
  const steamId = session?.steamId ? String(session.steamId) : null;

  if (body.action === "call") {
    if (!steamId) return NextResponse.json({ error: "sign in first" }, { status: 401 });

    const matchId = Number(body.matchId);
    const match = Number.isFinite(matchId)
      ? await prisma.tournamentMatch.findUnique({ where: { Id: matchId } })
      : null;

    if (!match) return NextResponse.json({ error: "no such match" }, { status: 404 });

    // One open call per match is enough. Ten people pressing the button because
    // nothing visibly happened should not become ten DMs to every organizer.
    const existing = await prisma.tournamentAlert.findFirst({
      where: { MatchId: match.Id, AckedAt: null },
    });
    if (existing) return NextResponse.json({ ok: true, id: existing.Id, alreadyOpen: true });

    const alert = await raiseAlert({
      source: "chat",
      matchId: match.Id,
      steamId,
      // The site's own name resolution, rather than a table read invented here:
      // it already knows where a display name comes from and in what order.
      name: await resolveName(steamId),
      reason: (body.reason ?? "").slice(0, 240) || null,
    });

    return NextResponse.json({ ok: true, id: alert.Id });
  }

  if (body.action === "ack") {
    const alertId = Number(body.alertId);
    const alert = Number.isFinite(alertId)
      ? await prisma.tournamentAlert.findUnique({ where: { Id: alertId } })
      : null;

    if (!alert) return NextResponse.json({ error: "no such alert" }, { status: 404 });
    if (!alert.TournamentId) return NextResponse.json({ error: "alert has no tournament" }, { status: 400 });

    const ctx = await getTournamentContext(null);
    if (!(await canManage(ctx, alert.TournamentId))) {
      return NextResponse.json({ error: "not an organizer" }, { status: 403 });
    }

    await ackAlert(alertId, steamId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
