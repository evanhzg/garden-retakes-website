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
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    return NextResponse.json({ steamId: target, matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the match history." },
      { status: 500 }
    );
  }
}
