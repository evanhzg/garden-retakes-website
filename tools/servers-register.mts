/**
 * Register the VPS tournament instances with the website.
 *
 *   node --import ./tools/_alias-loader.mjs tools/servers-register.mts <file.json>
 *
 * The JSON is [{ id, port, rcon }] as produced from /opt/cs2/instances on the
 * box. Passwords go straight from that file into the row and are never printed:
 * the whole reason the admin API refuses to return RconPassword is that a value
 * which is never displayed cannot be leaked by a screenshot or a scrollback.
 *
 * Idempotent on (Host, Port) — running it twice updates rather than duplicating,
 * which matters because the registry already contains one server entered twice
 * under two names.
 */
import fs from "node:fs";
import { prisma } from "@/lib/db";

const HOST = "213.130.147.107";

const file = process.argv[2];
if (!file) {
  console.error("usage: servers-register.mts <file.json>");
  process.exit(2);
}

const instances: { id: string; port: string; rcon: string }[] = JSON.parse(
  fs.readFileSync(file, "utf8"),
);

for (const instance of instances) {
  const port = Number(instance.port);
  if (!Number.isInteger(port) || !instance.rcon) {
    console.log(`${instance.id}: skipped (no port or no password)`);
    continue;
  }

  const existing = await prisma.gameServer.findFirst({
    where: { Host: HOST, Port: port },
    select: { Id: true },
  });

  const data = {
    Name: `Tournament ${instance.id.toUpperCase()}`,
    Host: HOST,
    Port: port,
    RconPassword: instance.rcon,
    // The address players type. t1 is the only one reachable without a port,
    // because a DNS A record carries no port and the box has one IP — so the
    // rest carry theirs explicitly rather than handing out an address that
    // silently lands on t1.
    ConnectAddress: instance.id === "t1" ? "play.retakes.fr" : `${HOST}:${port}`,
    IsTournament: true,
  };

  if (existing) {
    await prisma.gameServer.update({ where: { Id: existing.Id }, data });
    console.log(`${instance.id}: updated #${existing.Id} (port ${port})`);
  } else {
    const created = await prisma.gameServer.create({ data: { ...data, Status: "idle" } });
    console.log(`${instance.id}: created #${created.Id} (port ${port})`);
  }
}

await prisma.$disconnect();
