/**
 * Release a claimed server.
 *
 *   node --import ./tools/_alias-loader.mjs tools/servers-release.mts <serverId...>
 *   node --import ./tools/_alias-loader.mjs tools/servers-release.mts --stale
 *
 * A server is claimed for the duration of a match and released by finishMap().
 * A match abandoned before it finished — a failed start, a test somebody walked
 * away from — leaves the row busy forever, and claimServer() skips busy rows, so
 * the fleet quietly shrinks. `--stale` finds the ones whose match is already
 * finished or gone.
 */
import { prisma } from "@/lib/db";

const args = process.argv.slice(2);

async function release(id: number, why: string) {
  await prisma.gameServer.update({
    where: { Id: id },
    data: { Status: "idle", CurrentMatchId: null },
  });
  console.log(`#${id}: released — ${why}`);
}

if (args.includes("--stale")) {
  const claimed = await prisma.gameServer.findMany({
    where: { CurrentMatchId: { not: null } },
    select: { Id: true, Name: true, CurrentMatchId: true },
  });

  for (const server of claimed) {
    const match = await prisma.tournamentMatch.findUnique({
      where: { Id: server.CurrentMatchId! },
      select: { State: true },
    });

    if (!match) {
      await release(server.Id, `match ${server.CurrentMatchId} no longer exists`);
    } else if (match.State === "finished") {
      await release(server.Id, `match ${server.CurrentMatchId} is finished`);
    } else {
      console.log(`#${server.Id} "${server.Name}": match ${server.CurrentMatchId} is ${match.State} — leaving it`);
    }
  }
} else {
  for (const arg of args) {
    const id = Number(arg);
    if (Number.isInteger(id)) await release(id, "asked for by hand");
  }
}

await prisma.$disconnect();
