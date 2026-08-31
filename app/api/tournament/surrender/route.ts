import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getTournamentContext, canManage } from "@/lib/tournamentAuth";
import { decideSurrender, type SurrenderMember } from "@/lib/tournament/surrender";
import { forceEndMatch } from "@/lib/tournament/matchRunner";
import { execOnServer } from "@/lib/tournament/servers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Concede a map.
 *
 * A surrender is a forfeit, so it goes through forceEndMatch and gets the same
 * scoreline any other forfeit gets — the winner on the number that takes a map
 * and the loser keeping what they earned. Writing a second "give them 13" here
 * would be a third copy of that rule, and the interesting cases (a winner
 * already past 13 in overtime, a loser on 13) are exactly the ones a fresh copy
 * gets wrong. lib/tournament/forceEnd.ts owns it.
 *
 * The server is told afterwards and is allowed to fail. Losing RCON must not
 * mean the match cannot be conceded — that is the failure mode force-ending was
 * rebuilt around, where a restarted game server left a match live forever.
 */
export async function POST(req: Request) {
  const session = getSession();

  let body: { matchId?: number; slot?: "a" | "b" } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = Number(body.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "matchId?" }, { status: 400 });
  }

  const match = await prisma.tournamentMatch.findUnique({ where: { Id: matchId } });
  if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

  const ctx = await getTournamentContext();
  const isAdmin = await canManage(ctx, match.TournamentId);

  // Both rosters, because the decision needs to know which one the viewer is on
  // and refuse them if the answer is somehow "both".
  const teamIds = [match.TeamAId, match.TeamBId].filter((id): id is number => id !== null);
  const [members, teams] = await Promise.all([
    teamIds.length
      ? prisma.tournamentTeamMember.findMany({
          where: { TeamId: { in: teamIds } },
          select: { TeamId: true, SteamId: true, IsCaptain: true, Status: true, IsBot: true },
        })
      : Promise.resolve([]),
    teamIds.length
      ? prisma.tournamentTeam.findMany({
          where: { Id: { in: teamIds } },
          select: { Id: true, CaptainSteamId: true },
        })
      : Promise.resolve([]),
  ]);

  /**
   * Captaincy is written down twice and the two can disagree.
   *
   * TournamentTeam.CaptainSteamId is what the match page uses to decide whose
   * turn it is and which buttons to draw; TournamentTeamMember.IsCaptain is what
   * the roster editor sets. A team whose captain was changed through one of them
   * has a row the other still disagrees with, and a viewer who is captain by the
   * page's reckoning but not the roster's would be shown a button that then
   * refused them — the worst of both.
   *
   * Either mark counts. Both mean the same thing to a player.
   */
  const rosterOf = (teamId: number | null): SurrenderMember[] => {
    if (teamId === null) return [];
    const named = teams.find((x) => x.Id === teamId)?.CaptainSteamId?.toString();

    return members
      .filter((m) => m.TeamId === teamId)
      .map((m) => {
        const steamId = m.SteamId.toString();
        return {
          steamId,
          isCaptain: m.IsCaptain || steamId === named,
          status: m.Status,
          isBot: m.IsBot ?? false,
        };
      });
  };

  const decision = decideSurrender({
    steamId: session?.steamId ? String(session.steamId) : null,
    state: match.State,
    teamA: rosterOf(match.TeamAId),
    teamB: rosterOf(match.TeamBId),
    isAdmin,
    adminSlot: body.slot,
  });

  if (!decision.ok) {
    // 403 rather than 400: every refusal here is about who is asking, except
    // the two about match state, and those read fine as "not allowed now".
    return NextResponse.json({ error: decision.error }, { status: 403 });
  }

  const result = await forceEndMatch(matchId, decision.winner);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Tell the server, so the players in it see the map end rather than standing
  // in a round that no longer counts. css_t_surrender runs the plugin's own
  // concede — the same one `.gg` uses — which syncs the scoreboard and finishes
  // the map. Failure is logged and swallowed: the result is already recorded.
  let reply: string | undefined;
  if (match.ServerId) {
    try {
      reply = await execOnServer(match.ServerId, `css_t_surrender ${decision.slot}`);
    } catch (err) {
      console.warn(`surrender: match ${matchId} recorded but the server was not told:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    slot: decision.slot,
    winner: decision.winner,
    asAdmin: decision.asAdmin,
    reply,
  });
}
