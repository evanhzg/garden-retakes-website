import { prisma } from "@/lib/db";
import { finishMap } from "@/lib/tournament/matchRunner";
import { autoVeto } from "@/lib/tournament/vetoRunner";

// Playing a bot tournament out without a server.
//
// The point of this is to exercise the REAL pipeline. Every result goes through
// finishMap(), which is the same function the plugin's ingest calls — so this
// tests bracket advancement, series arithmetic, server release and the stats
// tab, rather than testing a second implementation that happens to write
// similar-looking rows. If simulation passes and a real match does not, the bug
// is in the plugin or the transport, which is exactly the split you want.
//
// Deliberately not random-free: a bracket where every match ends 13-0 tells you
// the wiring works and nothing about whether the tables read well.

/** A seeded generator, so a simulated bracket is reproducible from its id. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32 — small, fast, and good enough to make scores look played.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100_000) / 100_000;
  };
}

/** An MR12 scoreline: 13-x, or overtime, weighted towards close games. */
function scoreline(random: () => number): [number, number] {
  const roll = random();

  if (roll < 0.08) {
    // Overtime. 16-14 is the shortest one that can happen under MR12 + MR3.
    const extra = Math.floor(random() * 3) * 3;
    return [16 + extra, 14 + extra];
  }

  // Loser's rounds, biased low but rarely a shutout — a 13-0 in a bracket of
  // simulated matches makes every table look broken.
  const loser = Math.min(11, Math.floor(random() * random() * 13));
  return [13, loser];
}

/**
 * Per-player numbers that add up.
 *
 * Kills across both teams have to be close to the rounds played or the stats
 * tab reads as nonsense — a scoreboard where five players have 40 kills each in
 * a 13-4 game is worse than an empty one, because it looks like data.
 */
function playerLine(rounds: number, winning: boolean, random: () => number) {
  const share = 0.55 + random() * 0.9;
  const kills = Math.round(rounds * (winning ? 0.78 : 0.58) * share);
  const deaths = Math.round(rounds * (winning ? 0.55 : 0.76) * (0.8 + random() * 0.5));
  const assists = Math.round(kills * (0.15 + random() * 0.3));

  const adr = 55 + random() * 55;
  const damage = Math.round(adr * rounds);

  // Column names, so the object drops straight into createMany.
  return {
    Kills: kills,
    Deaths: Math.max(1, deaths),
    Assists: assists,
    Headshots: Math.round(kills * (0.3 + random() * 0.4)),
    Damage: damage,
    UtilityDamage: Math.round(rounds * random() * 8),
    EntryKills: Math.round(kills * random() * 0.25),
    EntryDeaths: Math.round(deaths * random() * 0.25),
    Clutches: random() < 0.28 ? 1 + Math.floor(random() * 2) : 0,
    RoundsPlayed: rounds,
    KastRounds: Math.round(rounds * (0.6 + random() * 0.3)),
    Rating: Number(((winning ? 1.05 : 0.9) + (random() - 0.5) * 0.5).toFixed(2)),
  };
}

export type SimResult = {
  matchesPlayed: number;
  message: string;
};

/**
 * Play every playable match in a tournament to completion.
 *
 * Loops rather than resolving one round at a time, because finishMap() advances
 * the bracket as a side effect — after the first round finishes, the second
 * round's matches have teams in them and become playable in the next pass.
 */
export async function simulateTournament(
  tournamentId: number,
  options: { maxMatches?: number } = {},
): Promise<SimResult> {
  const tournament = await prisma.tournament.findUnique({
    where: { Id: tournamentId },
    select: { Id: true, IsTest: true, StartedAt: true, Maps: { select: { Map: true } } },
  });

  if (!tournament) return { matchesPlayed: 0, message: "No such tournament." };

  // The guard that keeps this out of a real event. IsTest is set deliberately
  // and is not the same thing as unpublished — an unpublished tournament is a
  // real one somebody is still setting up.
  if (!tournament.IsTest) {
    return { matchesPlayed: 0, message: "Not a test tournament." };
  }
  if (tournament.StartedAt === null) {
    return { matchesPlayed: 0, message: "Start the tournament first." };
  }

  const pool = tournament.Maps.map((m) => m.Map);
  const fallback = pool.length > 0 ? pool : ["de_dust2"];

  const random = rng(tournamentId * 7919 + 13);
  const limit = options.maxMatches ?? 64;
  let played = 0;

  while (played < limit) {
    // A match is playable when both slots are filled and it is not finished.
    const match = await prisma.tournamentMatch.findFirst({
      where: {
        TournamentId: tournamentId,
        State: { not: "finished" },
        TeamAId: { not: null },
        TeamBId: { not: null },
      },
      orderBy: [{ Round: "asc" }, { Slot: "asc" }],
      include: { Maps: { orderBy: { Ordinal: "asc" } } },
    });

    if (!match) break;

    // Bots veto for themselves.
    //
    // This used to invent a map out of the pool and write a row directly, which
    // meant a simulated bracket never exercised the veto at all — the one part
    // of the flow most likely to be wrong, skipped by the thing meant to test
    // it. autoVeto plays the real sequence through the real validator and
    // materialises the maps the same way a captain-run veto now does, so a
    // simulated match arrives at exactly the state a played one does.
    let maps = match.Maps;

    if (maps.length === 0) {
      await autoVeto(match.Id, random);
      maps = await prisma.tournamentMatchMap.findMany({
        where: { MatchId: match.Id },
        orderBy: { Ordinal: "asc" },
      });
    }

    let live = maps.find((m) => m.State === "live");

    if (!live) {
      const next = maps.find((m) => m.State !== "finished");
      if (next) {
        live = await prisma.tournamentMatchMap.update({
          where: { Id: next.Id },
          data: { State: "live" },
        });
      } else {
        // Only reachable when the pool is empty and the veto had nothing to
        // work with, which is a misconfigured tournament rather than a normal
        // state — but the simulation should say so by playing rather than by
        // hanging.
        live = await prisma.tournamentMatchMap.create({
          data: {
            MatchId: match.Id,
            Ordinal: maps.length,
            Map: fallback[Math.floor(random() * fallback.length)],
            State: "live",
          },
        });
      }
    }

    const [winnerScore, loserScore] = scoreline(random);
    const aWins = random() < 0.5;
    const scoreA = aWins ? winnerScore : loserScore;
    const scoreB = aWins ? loserScore : winnerScore;

    await writeStats(match.Id, live.Id, match.TeamAId!, match.TeamBId!, scoreA, scoreB, random);

    const result = await finishMap(match.MatchKey, scoreA, scoreB);
    if (!result.ok) break;

    played++;
  }

  return {
    matchesPlayed: played,
    message: played === 0 ? "Nothing left to play." : `Played ${played} map(s).`,
  };
}

/** One stat row per player on both rosters, so the stats tab has something. */
async function writeStats(
  matchId: number,
  mapId: number,
  teamAId: number,
  teamBId: number,
  scoreA: number,
  scoreB: number,
  random: () => number,
): Promise<void> {
  const members = await prisma.tournamentTeamMember.findMany({
    where: { TeamId: { in: [teamAId, teamBId] }, Status: "accepted" },
    select: { SteamId: true, TeamId: true },
  });

  if (members.length === 0) return;

  const rounds = scoreA + scoreB;

  await prisma.tournamentPlayerStat.createMany({
    data: members.map((m) => {
      const winning = m.TeamId === teamAId ? scoreA > scoreB : scoreB > scoreA;
      return {
        MatchId: matchId,
        MapId: mapId,
        SteamId: m.SteamId,
        TeamId: m.TeamId,
        ...playerLine(rounds, winning, random),
      };
    }),
    skipDuplicates: true,
  });
}
