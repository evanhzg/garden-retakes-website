/**
 * Put a demo tournament match on a real server, filled with bots.
 *
 *   node --import ./tools/_alias-loader.mjs tools/demo-live.mts [slug]
 *
 * The same startLiveBotMatch() the admin button calls, so a pass here is a pass
 * for the button. Refuses anything not flagged IsTest.
 */
import { prisma } from "@/lib/db";
import { startLiveBotMatch } from "@/lib/tournament/liveTest";

const slug = process.argv[2] ?? "demo-running";

const tournament = await prisma.tournament.findUnique({
  where: { Slug: slug },
  select: { Id: true, Name: true },
});

if (!tournament) {
  console.log(`${slug}: not seeded`);
} else {
  console.log(`── ${tournament.Name}`);
  const result = await startLiveBotMatch(tournament.Id);

  for (const line of result.log) console.log(`   ${line}`);

  if (result.ok) {
    console.log(`   OK — match ${result.matchId}, connect ${result.connect}`);
  } else {
    console.log(`   FAILED — ${result.error}`);
  }
}

await prisma.$disconnect();
