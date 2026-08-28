import fs from "node:fs";
for (const line of fs.readFileSync("/home/evan/projects/Garden-website/.env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { prisma } = await import("@/lib/db");
const { execOnServer } = await import("@/lib/tournament/servers");

const id = Number(process.argv[2] ?? 4);
for (const cmd of process.argv.slice(3)) {
  try {
    const r = await execOnServer(id, cmd);
    console.log(`  ${cmd.padEnd(28)} → ${(r.replace(/\s+/g, " ").trim() || "(silent)").slice(0, 110)}`);
  } catch (e) {
    console.log(`  ${cmd.padEnd(28)} → ERR ${e instanceof Error ? e.message : e}`);
  }
}
await prisma.$disconnect();
