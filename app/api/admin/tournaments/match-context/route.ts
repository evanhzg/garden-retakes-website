import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canModerate, getTournamentContext } from "@/lib/tournamentAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * What the match admin panel needs to draw itself honestly.
 *
 * One request rather than four, and a GET rather than props threaded through
 * three components: the panel opens over a page that does not have any of this
 * — the score, the roster, the fleet — and plumbing it down would have meant
 * every caller of the modal fetching things it does not itself use.
 *
 * The point of it is the controls that used to be blank boxes. A score field
 * with nothing in it invites an admin to type a correction from memory; a role
 * control keyed on a SteamID typed by hand is a control nobody uses twice; a
 * server dropdown that does not say which boxes are busy is a way to break two
 * matches with one click.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = Number(url.searchParams.get("matchId"));

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "matchId is required." }, { status: 400 });
  }

  const ctx = await getTournamentContext(url.searchParams.get("key"));

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: {
      Id: true,
      MatchKey: true,
      State: true,
      ServerId: true,
      PendingServerId: true,
      TournamentId: true,
      TeamAId: true,
      TeamBId: true,
      Maps: {
        select: { Id: true, Ordinal: true, State: true, Map: true, ScoreA: true, ScoreB: true },
        orderBy: { Ordinal: "asc" },
      },
    },
  });

  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  // Moderate rather than manage: fixing a live match is exactly the
  // intervention a moderator is for, and it is the same gate the panel's own
  // actions use.
  if (!(await canModerate(ctx, match.TournamentId))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const teams = await prisma.tournamentTeam.findMany({
    where: { Id: { in: [match.TeamAId, match.TeamBId].filter((n): n is number => n !== null) } },
    select: {
      Id: true,
      Name: true,
      Members: {
        select: { SteamId: true, DisplayName: true, RoleT: true, RoleCt: true, IsBot: true },
      },
    },
  });

  const rosterOf = (teamId: number | null) => {
    const team = teams.find((x) => x.Id === teamId);
    return (team?.Members ?? []).map((m) => ({
      steamId: m.SteamId.toString(),
      name: m.DisplayName,
      roleT: m.RoleT,
      roleCt: m.RoleCt,
      isBot: m.IsBot,
    }));
  };

  // Every server, not only the free ones. A dropdown that hides the busy boxes
  // cannot explain why the fleet looks half its size, and "why can I not pick
  // T3" is answered by showing T3 greyed with the match that has it.
  const servers = await prisma.gameServer.findMany({
    where: { IsTournament: true },
    orderBy: { Id: "asc" },
    select: { Id: true, Name: true, Status: true, CurrentMatchId: true },
  });

  const holders = await prisma.tournamentMatch.findMany({
    where: { Id: { in: servers.map((s) => s.CurrentMatchId).filter((n): n is number => n !== null) } },
    select: { Id: true, MatchKey: true },
  });

  // The tournament's own pool, for the map control. A free-text box would let
  // an admin send the server to a map the plugin has no spawns for, which is a
  // match that loads and cannot be played.
  const pool = await prisma.tournamentMap.findMany({
    where: { TournamentId: match.TournamentId },
    orderBy: { Ordinal: "asc" },
    select: { Map: true },
  });

  const live = match.Maps.find((m) => m.State === "live") ?? null;

  return NextResponse.json({
    matchId: match.Id,
    matchKey: match.MatchKey,
    state: match.State,
    serverId: match.ServerId,
    pendingServerId: match.PendingServerId,
    // The LIVE map's score, which is what an admin correcting a scoreboard
    // means. The match's own score counts maps won and is a different number
    // that happens to look the same on a BO1.
    score: live ? { a: live.ScoreA, b: live.ScoreB, map: live.Map, ordinal: live.Ordinal } : null,
    pool: pool.map((p) => p.Map),
    maps: match.Maps.map((m) => ({
      id: m.Id,
      ordinal: m.Ordinal,
      state: m.State,
      map: m.Map,
      scoreA: m.ScoreA,
      scoreB: m.ScoreB,
    })),
    rosterA: rosterOf(match.TeamAId),
    rosterB: rosterOf(match.TeamBId),
    servers: servers.map((s) => ({
      id: s.Id,
      name: s.Name,
      busy: s.CurrentMatchId !== null && s.CurrentMatchId !== match.Id,
      isThisMatch: s.CurrentMatchId === match.Id,
      matchId: s.CurrentMatchId,
      matchKey: holders.find((h) => h.Id === s.CurrentMatchId)?.MatchKey ?? null,
    })),
  });
}
