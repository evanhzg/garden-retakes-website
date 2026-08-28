import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Competitive matches a player has actually played.
//
// The lobby used to show two fabricated "live games" with Player1..Player10 in
// them, and a "View Last Match" button wired to a hardcoded 13-11 against two
// invented teammates. Both are gone; this is where the tab gets its rows now.
//
// CrMatches is written by the game server at the end of every match — see
// FinishCrMatch in RE5-plugin. Nothing here writes to it, and there is no seed:
// until somebody plays a match this returns an empty list, and the tab says so.

/** The plugin stores a roster as its SteamID64s, sorted and dash-joined. */
const rosterOf = (key: string) => (key ?? "").split("-").filter(Boolean);

/**
 * The tournament-pipeline matches this player was in.
 *
 * Every lobby game is one of these now, and unlike a CrMatch they have a page:
 * `/tournaments/<slug>/match/<id>`, carrying the scoreboard, the veto, the roles
 * and — for an organizer — the admin controls. A CrMatch has nowhere to link to,
 * which is why `url` is null on those and set on these.
 *
 * Shaped exactly like the CrMatch rows so the two merge and the client never has
 * to know which system a row came from.
 */
async function tournamentMatchesFor(target: string, limit: number) {
  try {
    const memberships = await prisma.tournamentTeamMember.findMany({
      where: { SteamId: BigInt(target), Status: { not: "removed" } },
      select: { TeamId: true },
    });

    const teamIds = memberships.map((m) => m.TeamId);
    if (teamIds.length === 0) return [];

    const rows = await prisma.tournamentMatch.findMany({
      where: { OR: [{ TeamAId: { in: teamIds } }, { TeamBId: { in: teamIds } }] },
      orderBy: { Id: "desc" },
      take: limit,
      include: { Tournament: { select: { Slug: true, TeamSize: true } } },
    });

    if (rows.length === 0) return [];

    const teams = await prisma.tournamentTeam.findMany({
      where: {
        Id: {
          in: rows.flatMap((m) => [m.TeamAId, m.TeamBId].filter((x): x is number => x !== null)),
        },
      },
      include: { Members: { where: { Status: { not: "removed" } }, select: { SteamId: true } } },
    });

    const teamById = new Map(teams.map((x) => [x.Id, x]));
    const involved = new Set(teamIds);

    return rows.map((m) => {
      const mine = m.TeamAId !== null && involved.has(m.TeamAId) ? "A" : "B";
      const myTeam = teamById.get((mine === "A" ? m.TeamAId : m.TeamBId) ?? -1);
      const theirTeam = teamById.get((mine === "A" ? m.TeamBId : m.TeamAId) ?? -1);

      const decided = m.WinnerTeamId !== null;
      const won = decided && m.WinnerTeamId === myTeam?.Id;

      const outcome: "win" | "loss" | "draw" | "cancelled" =
        m.State !== "finished" ? "cancelled" : !decided ? "draw" : won ? "win" : "loss";

      return {
        id: `t${m.Id}`,
        seasonId: 0,
        // A series has no one map. The page lists every map it played.
        map: "",
        startedAt: (m.StartedAt ?? m.EndedAt ?? new Date()).toISOString(),
        endedAt: m.EndedAt ? m.EndedAt.toISOString() : null,
        teamSize: m.Tournament.TeamSize,
        score: (mine === "A" ? [m.ScoreA, m.ScoreB] : [m.ScoreB, m.ScoreA]) as [number, number],
        teamName: myTeam?.Name ?? "",
        opponentName: theirTeam?.Name ?? "",
        roster: (myTeam?.Members ?? []).map((x) => x.SteamId.toString()),
        opponents: (theirTeam?.Members ?? []).map((x) => x.SteamId.toString()),
        // These do not move retakes ELO.
        eloDelta: 0,
        outcome,
        url: `/tournaments/${m.Tournament.Slug}/match/${m.Id}`,
      };
    });
  } catch {
    // Half a history is better than none: if this side fails, the CrMatch rows
    // still render.
    return [];
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asked = url.searchParams.get("steamId");
  const target = /^\d{5,20}$/.test(asked ?? "") ? asked! : getSession()?.steamId;
  if (!target) return NextResponse.json({ error: "Sign in to see your matches." }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));

  try {
    // `contains` narrows it in SQL; the roster split below is what actually
    // decides. A 17-digit id can only appear at a dash boundary in a list of
    // 17-digit ids, but filtering on the parsed roster means that reasoning is
    // not load-bearing.
    const rows = await prisma.crMatch.findMany({
      where: {
        OR: [{ TeamAKey: { contains: target } }, { TeamBKey: { contains: target } }],
      },
      orderBy: { StartedAtUtc: "desc" },
      take: limit * 2,
    });

    const matches = rows
      .map((m) => {
        const a = rosterOf(m.TeamAKey);
        const b = rosterOf(m.TeamBKey);
        const mine = a.includes(target) ? "A" : b.includes(target) ? "B" : null;
        if (!mine) return null;

        const won = m.Result === mine;
        const drawn = m.Result !== "A" && m.Result !== "B";

        return {
          id: m.Id.toString(),
          seasonId: m.SeasonId,
          map: m.Map,
          startedAt: m.StartedAtUtc,
          endedAt: m.EndedAtUtc,
          teamSize: m.TeamSize,
          // Always the viewer's side first, so a row reads left to right as
          // "us, them" rather than as whichever roster the server called A.
          score: mine === "A" ? [m.ScoreA, m.ScoreB] : [m.ScoreB, m.ScoreA],
          teamName: mine === "A" ? m.TeamAName : m.TeamBName,
          opponentName: mine === "A" ? m.TeamBName : m.TeamAName,
          roster: mine === "A" ? a : b,
          opponents: mine === "A" ? b : a,
          eloDelta: mine === "A" ? m.EloDeltaA : m.EloDeltaB,
          // "cancelled" is a real outcome here — a roster that emptied out —
          // and it is neither a win nor a draw.
          outcome: m.Result === "cancelled" ? "cancelled" : won ? "win" : drawn ? "draw" : "loss",
          // CrMatches are written by the game server and have no page of their
          // own — the tournament ones below do.
          url: null as string | null,
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    // Matches that ran through the tournament pipeline, which is every lobby
    // game now: those have a page with the scoreboard, the veto, the roles and
    // the admin controls on it, so the list can link to it rather than being a
    // dead end.
    const tournament = await tournamentMatchesFor(target, limit);

    // Newest first across both sources, so a player's history reads as one list
    // rather than as two systems they have to know about.
    const merged = [...matches, ...tournament]
      .sort((x, y) => Date.parse(String(y!.startedAt ?? 0)) - Date.parse(String(x!.startedAt ?? 0)))
      .slice(0, limit);

    return NextResponse.json({ steamId: target, matches: merged });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the match history." },
      { status: 500 }
    );
  }
}
