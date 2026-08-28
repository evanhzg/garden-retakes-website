#!/usr/bin/env node
/**
 * Sets GotvAddress on every tournament server, from the tv_port the server
 * actually reports.
 *
 *   node --import ./tools/_alias-loader.mjs tools/sync-gotv.mts            # dry run
 *   node --import ./tools/_alias-loader.mjs tools/sync-gotv.mts --apply
 *
 * This exists because the column was empty on every server, and an empty
 * GotvAddress is not an absent button — the match page falls back to the game
 * address, so "watch" sent every spectator at the players' own server, took one
 * of its slots and dropped them into a live round. The fix is a port, and the
 * port is knowable.
 */
//
// Derived rather than typed in: GOTV sits on game port + 5 by convention, but
// "by convention" is exactly the kind of thing that is wrong on one server out
// of six and impossible to spot from a scoreboard. Asking each server is one
// RCON round trip and cannot drift.
import fs from "node:fs";

for (const line of fs.readFileSync("/home/evan/projects/Garden-website/.env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const apply = process.argv.includes("--apply");

const { prisma } = await import("@/lib/db");
const { execOnServer } = await import("@/lib/tournament/servers");

const servers = await prisma.gameServer.findMany({
  where: { IsTournament: true },
  orderBy: { Id: "asc" },
});

for (const s of servers) {
  try {
    const enable = await execOnServer(s.Id, "tv_enable");
    const portLine = await execOnServer(s.Id, "tv_port");

    const on = /=\s*true/i.test(enable);
    const port = Number(/tv_port\s*=\s*(\d+)/i.exec(portLine)?.[1] ?? 0);

    if (!on || !port) {
      console.log(`#${s.Id} ${s.Name}: GOTV off or no port — left alone`);
      continue;
    }

    // The friendly hostname when the connect address already uses one; it
    // survives the box changing address, which a hardcoded IP does not.
    const host = (s.ConnectAddress?.split(":")[0] || s.Host).trim();
    const address = `${host}:${port}`;

    if (s.GotvAddress === address) {
      console.log(`#${s.Id} ${s.Name}: already ${address}`);
      continue;
    }

    console.log(`#${s.Id} ${s.Name}: ${s.GotvAddress ?? "(none)"} -> ${address}${apply ? "" : "  [dry run]"}`);

    if (apply) {
      await prisma.gameServer.update({ where: { Id: s.Id }, data: { GotvAddress: address } });
    }
  } catch (err) {
    console.log(`#${s.Id} ${s.Name}: UNREACHABLE ${err instanceof Error ? err.message : String(err)}`);
  }
}

await prisma.$disconnect();
