/**
 * Put a demo tournament match on a real server, filled with bots.
 *
 *   node --import ./tools/_alias-loader.mjs tools/demo-live.mts [slug] [map]
 *
 * The same startLiveBotMatch() the admin button calls, so a pass here is a pass
 * for the button. Refuses anything not flagged IsTest.
 *
 * The map argument steers the veto. Only de_dust2 has authored tournament
 * spawns so far, so a bot match anywhere else has nowhere for its players to
 * stand — the veto is pointed at it rather than the spawn engine being
 * special-cased.
 */
import { prisma } from "@/lib/db";
import { startLiveBotMatch } from "@/lib/tournament/liveTest";

const slug = process.argv[2] ?? "demo-running";
const prefer = process.argv[3] ?? "de_dust2";

const tournament = await prisma.tournament.findUnique({
  where: { Slug: slug },
  select: { Id: true, Name: true },
});

if (!tournament) {
  console.log(`${slug}: not seeded`);
} else {
  console.log(`── ${tournament.Name}  (preferring ${prefer})`);
  const result = await startLiveBotMatch(tournament.Id, prefer);

  for (const line of result.log) console.log(`   ${line}`);

  if (result.ok) {
    console.log(`   OK — match ${result.matchId}, connect ${result.connect}`);

    // What a spectator would actually be offered. The route decides this, so
    // asking the database the same question is the closest a script can get to
    // the button without a browser.
    const match = await prisma.tournamentMatch.findUnique({
      where: { Id: result.matchId! },
      select: { State: true, ServerId: true, Maps: { select: { Map: true, State: true } } },
    });
    console.log(
      `   spectate → state=${match?.State} server=${match?.ServerId ?? "none"} ` +
        `maps=${match?.Maps.map((m) => `${m.Map}:${m.State}`).join(", ")}`,
    );
  } else {
    console.log(`   FAILED — ${result.error}`);
  }
}

await prisma.$disconnect();
