/**
 * Open spectating on the demo tournaments.
 *
 *   node --import ./tools/_alias-loader.mjs tools/demo-spectate.mts
 *
 * So a bot match can be watched without first adding yourself to an allowlist
 * by SteamID64. Refuses anything not flagged IsTest, so it cannot be pointed at
 * a real event and quietly open its servers to the internet.
 */
import { prisma } from "@/lib/db";

const updated = await prisma.tournament.updateMany({
  where: { Slug: { in: ["demo-finished", "demo-running"] }, IsTest: true },
  data: { SpectatorsPublic: true },
});

console.log(`spectating opened on ${updated.count} test tournament(s)`);

// Show what a spectator would be offered, which is the thing being tested.
const live = await prisma.tournamentMatch.findMany({
  where: { Tournament: { Slug: { in: ["demo-finished", "demo-running"] } }, ServerId: { not: null } },
  select: { Id: true, State: true, ServerId: true },
});

for (const m of live) {
  const server = await prisma.gameServer.findUnique({
    where: { Id: m.ServerId! },
    select: { Name: true, Host: true, Port: true, ConnectAddress: true },
  });
  const connect = server?.ConnectAddress?.trim() || `${server?.Host}:${server?.Port}`;
  console.log(`  match ${m.Id} (${m.State}) → ${server?.Name}  connect ${connect}`);
}

await prisma.$disconnect();
