/**
 * Wind the demo tournaments back to just-started, so they can be replayed.
 *
 *   node --import ./tools/_alias-loader.mjs tools/demo-reset.mts
 *
 * Clears results, veto actions, maps and stats but keeps the teams and the
 * bracket. Refuses anything not flagged IsTest, so it can never be pointed at
 * a real event by a slip of the slug.
 */
import { prisma } from "@/lib/db";

const SLUGS = ["demo-finished", "demo-running"];

for (const slug of SLUGS) {
  const tournament = await prisma.tournament.findUnique({
    where: { Slug: slug },
    select: { Id: true, Name: true, IsTest: true },
  });

  if (!tournament) {
    console.log(`${slug}: not seeded`);
    continue;
  }
  if (!tournament.IsTest) {
    console.log(`${slug}: NOT a test tournament — refusing`);
    continue;
  }

  const matches = await prisma.tournamentMatch.findMany({
    where: { TournamentId: tournament.Id },
    select: { Id: true, Round: true },
  });
  const ids = matches.map((m) => m.Id);

  if (ids.length > 0) {
    await prisma.tournamentPlayerStat.deleteMany({ where: { MatchId: { in: ids } } });
    await prisma.tournamentMatchMap.deleteMany({ where: { MatchId: { in: ids } } });
    await prisma.tournamentVetoAction.deleteMany({ where: { MatchId: { in: ids } } });

    // Round 1 keeps its teams — they came from seeding, not from a result.
    // Everything above it was filled in by advance() and has to go back to
    // empty or the bracket would start half-populated.
    await prisma.tournamentMatch.updateMany({
      where: { Id: { in: ids } },
      // ServerId cleared too. Leaving it set on a reset match left a pending
      // match pointing at a server it no longer holds, which the spectate check
      // read as "there is somewhere to watch" and offered a button to an empty
      // server.
      data: {
        ScoreA: 0,
        ScoreB: 0,
        WinnerTeamId: null,
        State: "pending",
        EndedAt: null,
        VetoDeadline: null,
        ServerId: null,
      },
    });
    await prisma.tournamentMatch.updateMany({
      where: { Id: { in: ids }, Round: { gt: 1 } },
      data: { TeamAId: null, TeamBId: null },
    });
  }

  await prisma.tournament.update({
    where: { Id: tournament.Id },
    data: { State: "running" },
  });

  console.log(`${slug}: reset ${ids.length} matches`);
}

await prisma.$disconnect();
