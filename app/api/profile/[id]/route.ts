import { NextResponse } from "next/server";
import { getActiveSeason, prisma } from "@/lib/db";
import { fetchRows, summarize } from "@/lib/stats";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const steamId = BigInt(params.id);

    // Fetch the web profile
    const profile = await prisma.gardenWebProfile.findUnique({
      where: { SteamId: steamId }
    });

    /* THE NUMBERS WERE ALWAYS ZERO.
     *
     * This asked for season 0 — with a comment saying "season 0 usually gets
     * active", which is a guess, and a wrong one: SeasonId is an
     * autoincrement starting at 1, so the query matched no rows for anybody
     * and every card showed rating 0.00, 0% and 0 rounds. A player with 1907
     * ranked rounds got the same card as somebody who had never played.
     *
     * The active season is a column, not a convention. And when the ladder
     * has nothing to say — which is every player on a site running its
     * tournament half — the card falls back to the tournament record rather
     * than reporting zeroes as if they were a result. */
    const season = await getActiveSeason();
    const rows = season ? await fetchRows(season.Id, steamId, false) : [];
    let total = summarize(rows);

    if (total.rounds === 0) {
      const tourney = await prisma.tournamentPlayerStat.aggregate({
        where: { SteamId: steamId },
        _sum: { RoundsPlayed: true, Damage: true },
        _avg: { Rating: true },
      });
      const tRounds = tourney._sum.RoundsPlayed ?? 0;
      if (tRounds > 0) {
        total = {
          ...total,
          rounds: tRounds,
          rating: tourney._avg.Rating ?? 0,
          // A tournament stat line has no win column — a win is a property of
          // the match, not of the row — so this stays 0 rather than being
          // invented, and the card reads it as "no win rate yet".
          winPct: 0,
        };
      }
    }

    // What the site knows about them beyond their stats: the name people
    // actually see, and when they were last around. The bubble is opened to
    // decide whether to talk to somebody, and "last seen in March" answers
    // that better than a rating does.
    const known = await prisma.playerProfile.findUnique({
      where: { SteamId: steamId },
      select: { LastKnownName: true, LastSeenAtUtc: true },
    });

    return NextResponse.json({
      bio: profile?.Bio || "",
      country: profile?.Country || "",
      isPro: profile?.IsPro || false,
      rating: total.rating,
      winPct: total.winPct,
      rounds: total.rounds,
      name: known?.LastKnownName ?? null,
      lastSeen: known?.LastSeenAtUtc ? known.LastSeenAtUtc.getTime() : null,
      /** The status they chose. Null means online — see lib/presence.ts. */
      presence: profile?.Presence ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
