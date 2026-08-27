/**
 * Retire duplicate tournament servers.
 *
 *   node --import ./tools/_alias-loader.mjs tools/servers-dedupe.mts
 *
 * The registry contained the same physical box twice: "VPS 1" at
 * play.retakes.fr:27015 and "Tournament T1" at 213.130.147.107:27015. Both were
 * IsTournament and idle, and claimServer() picks any idle tournament row — so
 * two matches could each be told they had a server and both be handed the same
 * one. The second would load a map over the first, mid-round.
 *
 * A hostname and an address are not comparable without resolving them, so this
 * does not try to be clever: it takes an explicit list of rows to retire.
 * Retire, not delete — the row may be referenced by a finished match, and
 * IsTournament: false is enough to keep claimServer away from it while leaving
 * the history readable.
 */
import { prisma } from "@/lib/db";

/** Rows that duplicate another entry for the same machine. */
const RETIRE = [
  { id: 2, because: "play.retakes.fr:27015 is the same box as #4 213.130.147.107:27015" },
];

for (const { id, because } of RETIRE) {
  const server = await prisma.gameServer.findUnique({ where: { Id: id } });
  if (!server) {
    console.log(`#${id}: gone already`);
    continue;
  }

  if (server.CurrentMatchId !== null) {
    console.log(`#${id}: running match ${server.CurrentMatchId} — leaving it alone`);
    continue;
  }

  await prisma.gameServer.update({
    where: { Id: id },
    data: { IsTournament: false, Status: "disabled" },
  });

  console.log(`#${id} "${server.Name}": retired — ${because}`);
}

await prisma.$disconnect();
