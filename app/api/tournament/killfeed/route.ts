import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The tail of a match's killfeed.
 *
 * Deliberately its own route rather than another field on the match payload.
 * The feed is polled far more often than anything else on the page — it is the
 * one part that is worth watching second by second — and bolting it onto the
 * match route would drag the whole match, its maps and its server along on
 * every poll.
 *
 * `after` makes the steady state cheap: the page sends the highest id it has
 * and gets back only what happened since, which is usually nothing. The first
 * request omits it and gets the last few kills so the panel is not empty on
 * arrival.
 */
export async function GET(req: NextRequest) {
  const matchId = Number(req.nextUrl.searchParams.get("matchId"));
  if (!Number.isFinite(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw === null ? null : Number(afterRaw);

  // Only published tournaments. A killfeed is as much a leak of an unpublished
  // bracket as the bracket is.
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    select: { Id: true, Tournament: { select: { Published: true } } },
  });

  if (!match?.Tournament?.Published) {
    return NextResponse.json({ kills: [] });
  }

  const rows = await prisma.tournamentKill.findMany({
    where: {
      MatchId: matchId,
      ...(after !== null && Number.isFinite(after) ? { Id: { gt: after } } : {}),
    },
    // Newest first, capped. A long match produces hundreds of these and the
    // panel shows a handful; asking for all of them to throw most away is a
    // query that gets slower every round.
    orderBy: { Id: "desc" },
    take: 12,
  });

  return NextResponse.json({
    // Returned oldest-first so the client can append without reversing, which
    // is also the order they are drawn in.
    kills: rows.reverse().map((k) => ({
      id: k.Id,
      round: k.Round,
      mapOrdinal: k.MapOrdinal,
      attacker: k.AttackerSteamId.toString() === "0"
        ? null
        : { steamId: k.AttackerSteamId.toString(), name: k.AttackerName, slot: k.AttackerSlot },
      victim: { steamId: k.VictimSteamId.toString(), name: k.VictimName, slot: k.VictimSlot },
      assister: k.AssisterSteamId.toString() === "0"
        ? null
        : { steamId: k.AssisterSteamId.toString(), name: k.AssisterName, slot: k.AssisterSlot },
      weapon: k.Weapon,
      headshot: k.Headshot,
      teamKill: k.TeamKill,
      penetrated: k.Penetrated,
      noScope: k.NoScope,
      throughSmoke: k.ThroughSmoke,
      attackerBlind: k.AttackerBlind,
    })),
  });
}
