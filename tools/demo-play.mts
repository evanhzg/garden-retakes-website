/**
 * Start and play out the seeded demo tournaments.
 *
 *   node --import ./tools/_alias-loader.mjs tools/demo-play.mts
 *
 * Runs exactly what the admin buttons run — startTournament() to build the
 * bracket, then simulateTournament(), which resolves every match through the
 * same finishMap() the plugin's ingest calls. If this passes, the bracket
 * advancement, the series arithmetic and the stats writes are all working; a
 * real match that then fails is failing in the plugin or the transport.
 *
 * Only touches tournaments flagged IsTest, because both of those functions
 * refuse anything else.
 */
import { prisma } from "@/lib/db";
import { startTournament } from "@/lib/tournament/startTournament";
import { simulateTournament } from "@/lib/tournament/simulate";

const SLUGS = ["demo-finished", "demo-running"];

for (const slug of SLUGS) {
  const tournament = await prisma.tournament.findUnique({
    where: { Slug: slug },
    select: { Id: true, Name: true, StartedAt: true, IsTest: true },
  });

  if (!tournament) {
    console.log(`${slug}: not seeded — run tools/seed-demo-tournaments.mjs first`);
    continue;
  }

  console.log(`\n── ${tournament.Name} (${slug})`);

  if (tournament.StartedAt === null) {
    const started = await startTournament(tournament.Id);
    console.log(`   start: ${started.ok ? "bracket built" : started.error}`);
    if (!started.ok) continue;
  } else {
    console.log("   start: already started");
  }

  // The finished one plays to completion; the running one stops partway, which
  // is the state it exists to demonstrate.
  const limit = slug === "demo-finished" ? 64 : 3;
  const result = await simulateTournament(tournament.Id, { maxMatches: limit });
  console.log(`   play : ${result.message}`);

  const [matches, done, stats] = await Promise.all([
    prisma.tournamentMatch.count({ where: { TournamentId: tournament.Id } }),
    prisma.tournamentMatch.count({ where: { TournamentId: tournament.Id, State: "finished" } }),
    prisma.tournamentPlayerStat.count({ where: { Match: { TournamentId: tournament.Id } } }),
  ]);

  console.log(`   state: ${done}/${matches} matches finished, ${stats} stat rows`);

  if (slug === "demo-finished" && done === matches && matches > 0) {
    await prisma.tournament.update({
      where: { Id: tournament.Id },
      data: { State: "finished" },
    });
    console.log("   state: marked finished, so it appears in the archive");
  }
}

await prisma.$disconnect();
