#!/usr/bin/env node
/**
 * Proves bot names match between the website and the server.
 *
 *   node --import ./tools/_alias-loader.mjs tools/verify-bot-names.mts <matchId>
 *
 * The claim being checked is end to end and crosses three systems, so nothing
 * short of asking the server will do: the site stores a DisplayName, matchRunner
 * sends it as `css_t_bot <steamid> <name>`, the plugin seats a nameless engine
 * bot into that roster slot and renames the controller to match. A break
 * anywhere in that chain shows up as a scoreboard that cannot be reconciled with
 * the bracket, and it looks like nobody's fault.
 *
 * Read-only. Runs `status` and compares.
 */
import fs from "node:fs";

for (const line of fs.readFileSync("/home/evan/projects/Garden-website/.env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const matchId = Number(process.argv[2]);
if (!Number.isInteger(matchId)) {
  console.error("usage: verify-bot-names.mts <matchId>");
  process.exit(2);
}

const { prisma } = await import("@/lib/db");
const { execOnServer } = await import("@/lib/tournament/servers");

const match = await prisma.tournamentMatch.findUnique({ where: { Id: matchId } });
if (!match?.ServerId) {
  console.error(`match ${matchId} is not on a server`);
  process.exit(1);
}

const teams = await prisma.tournamentTeam.findMany({
  where: { Id: { in: [match.TeamAId, match.TeamBId].filter((x): x is number => x !== null) } },
  include: { Members: { where: { Status: "accepted" } } },
});

const expected = new Map<string, string>();
for (const team of teams) {
  for (const m of team.Members.filter((x) => x.IsBot)) {
    expected.set(m.SteamId.toString(), m.DisplayName ?? "");
  }
}

console.log(`Website expects ${expected.size} bots:`);
for (const [id, name] of expected) console.log(`  ${id}  ${name}`);

const status = await execOnServer(match.ServerId, "status");

// `status` lists one line per connected client; bot lines carry the name in
// quotes exactly as the scoreboard shows it.
const onServer = [...status.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
console.log(`\nServer reports ${onServer.length} named client(s):`);
for (const n of onServer) console.log(`  ${n}`);

const wanted = new Set(expected.values());
const missing = [...wanted].filter((n) => !onServer.includes(n));
const unexpected = onServer.filter((n) => !wanted.has(n) && /^Bot /i.test(n));

console.log("");
if (missing.length === 0 && unexpected.length === 0) {
  console.log("MATCH — every website name is present on the server, none left as an engine name");
} else {
  if (missing.length) console.log(`MISSING on server: ${missing.join(", ")}`);
  if (unexpected.length) console.log(`STILL ENGINE-NAMED: ${unexpected.join(", ")}`);
}

await prisma.$disconnect();
