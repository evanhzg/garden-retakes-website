/**
 * What game servers the website knows about.
 *
 *   node --import ./tools/_alias-loader.mjs tools/servers-list.mts
 *
 * Read-only, and never prints RconPassword — the whole reason the admin API
 * does not return it either.
 */
import { prisma } from "@/lib/db";

const servers = await prisma.gameServer.findMany({ orderBy: { Id: "asc" } });

if (servers.length === 0) {
  console.log("No servers registered. A tournament match has nowhere to start.");
} else {
  for (const s of servers) {
    console.log(
      `#${s.Id}  ${s.Name.padEnd(24)} ${s.Host}:${String(s.Port).padEnd(6)} ` +
        `${s.Status.padEnd(8)} tournament=${s.IsTournament} match=${s.CurrentMatchId ?? "-"}`,
    );
  }
}

await prisma.$disconnect();
