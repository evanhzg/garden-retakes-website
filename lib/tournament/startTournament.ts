import { prisma } from "@/lib/db";
import { faceitConfigured, faceitForSteamId } from "@/lib/faceit";
import { seedTeams, type Format, type Seeding } from "@/lib/tournament/edition";
import { roundRobin, singleElimination, resolveByes, type PlannedMatch } from "@/lib/tournament/bracket";

/**
 * Turning a registration list into a bracket.
 *
 * Called by the start button and nowhere else. The important property is that
 * it adapts to who actually turned up: an organizer who advertised 16 teams and
 * got 5 presses start and gets a 5-team bracket with byes, because waiting for
 * eleven teams that are not coming is not a feature.
 */

export type StartResult =
  | { ok: true; stageId: number; matches: number; teams: number }
  | { ok: false; error: string };

/**
 * A team's average FACEIT level, or null when it cannot be known.
 *
 * Null rather than zero, and the distinction matters at the seeding step: an
 * unranked team is UNKNOWN, not bad, and seedTeams puts unknown last rather
 * than pretending it is the weakest. A team where only some players are linked
 * averages the ones that are, which is the best available answer.
 */
async function faceitAverage(steamIds: string[]): Promise<number | null> {
  if (!faceitConfigured() || steamIds.length === 0) return null;

  const levels: number[] = [];

  for (const steamId of steamIds) {
    try {
      const profile = await faceitForSteamId(steamId);
      if (profile?.level != null) levels.push(profile.level);
    } catch {
      // One unreachable lookup must not fail a tournament start. A missing
      // level lowers confidence in the seed, which is survivable; a start
      // button that throws because FACEIT is having a bad morning is not.
    }
  }

  if (levels.length === 0) return null;
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}

export async function startTournament(tournamentId: number): Promise<StartResult> {
  const tournament = await prisma.tournament.findUnique({
    where: { Id: tournamentId },
    include: {
      Teams: {
        where: { Status: { not: "withdrawn" } },
        include: { Members: { where: { Status: "accepted" } } },
        orderBy: [{ Seed: "asc" }, { Id: "asc" }],
      },
      Stages: true,
    },
  });

  if (!tournament) return { ok: false, error: "No such tournament." };
  if (tournament.StartedAt) return { ok: false, error: "It has already started." };
  if (tournament.Teams.length < 2) {
    return { ok: false, error: "At least two teams are needed to start." };
  }

  // Generating twice would double a bracket in a way that is very hard to see
  // and impossible to play.
  const existingMatches = await prisma.tournamentMatch.count({
    where: { TournamentId: tournamentId },
  });
  if (existingMatches > 0) {
    return { ok: false, error: "This tournament already has matches." };
  }

  const seeding = (tournament.Seeding as Seeding) ?? "random";
  const format = (tournament.Format as Format) ?? "single";

  // FACEIT is the only seeding that costs network calls, so it is the only one
  // that makes them.
  const withLevels = await Promise.all(
    tournament.Teams.map(async (team) => ({
      id: team.Id,
      name: team.Name,
      faceitAverage:
        seeding === "faceit"
          ? await faceitAverage(team.Members.map((m) => m.SteamId.toString()))
          : null,
    })),
  );

  const ordered = seedTeams(withLevels, seeding);

  // The seed is written back so the bracket page can show it and so a
  // regenerated bracket is reproducible rather than freshly random.
  await prisma.$transaction(
    ordered.map((team, i) =>
      prisma.tournamentTeam.update({ where: { Id: team.id }, data: { Seed: i + 1 } }),
    ),
  );

  const stage = await prisma.tournamentStage.create({
    data: {
      TournamentId: tournamentId,
      Name: format === "group" || format === "swiss" ? "Group stage" : "Playoffs",
      Kind: format,
      Ordinal: tournament.Stages.length,
      BestOf: tournament.BestOf,
      FinalBestOf: tournament.FinalBestOf,
      State: "live",
    },
  });

  const forBracket = ordered.map((team, i) => ({ id: team.id, seed: i + 1, name: team.name }));

  const planned: PlannedMatch[] =
    format === "group" || format === "swiss"
      ? roundRobin(forBracket, tournament.BestOf)
      : resolveByes(
          singleElimination(forBracket, tournament.BestOf, tournament.FinalBestOf ?? undefined),
        );

  // Two passes: rows first to get their ids, then the forward pointers, because
  // a match cannot reference one that does not exist yet.
  const created = await prisma.$transaction(
    planned.map((m) =>
      prisma.tournamentMatch.create({
        data: {
          TournamentId: tournamentId,
          StageId: stage.Id,
          MatchKey: `t${tournamentId}s${stage.Id}r${m.round}m${m.slot}`,
          Round: m.round,
          Slot: m.slot,
          BestOf: m.bestOf,
          TeamAId: m.teamAId,
          TeamBId: m.teamBId,
          State: m.isBye ? "finished" : "pending",
          WinnerTeamId: m.isBye ? m.teamAId ?? m.teamBId : null,
        },
      }),
    ),
  );

  const idByRef = new Map(planned.map((m, i) => [m.ref, created[i].Id]));

  await prisma.$transaction(
    planned
      .filter((m) => m.nextRef !== null || m.loserNextRef !== null)
      .map((m) =>
        prisma.tournamentMatch.update({
          where: { Id: idByRef.get(m.ref)! },
          data: {
            NextMatchId: m.nextRef !== null ? idByRef.get(m.nextRef) ?? null : null,
            NextSlot: m.nextSlot,
            LoserNextMatchId: m.loserNextRef !== null ? idByRef.get(m.loserNextRef) ?? null : null,
            LoserNextSlot: m.loserNextSlot,
          },
        }),
      ),
  );

  await prisma.tournament.update({
    where: { Id: tournamentId },
    data: { StartedAt: new Date(), State: "live", Published: true },
  });

  return { ok: true, stageId: stage.Id, matches: planned.length, teams: ordered.length };
}
