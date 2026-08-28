import fs from "node:fs";
for (const line of fs.readFileSync("/home/evan/projects/Garden-website/.env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { prisma } = await import("@/lib/db");
const { execOnServer } = await import("@/lib/tournament/servers");
const servers = await prisma.gameServer.findMany({ where: { IsTournament: true }, orderBy: { Id: "asc" } });
for (const s of servers) {
  try {
    await execOnServer(s.Id, "tv_delay 0");
    const out = await execOnServer(s.Id, "tv_delay; tv_enable");
    console.log(`#${s.Id} ${s.Name}: ${out.replace(/\s+/g, " ").trim().slice(0, 120)}`);
  } catch (e) {
    console.log(`#${s.Id} ${s.Name}: ${e instanceof Error ? e.message : e}`);
  }
}
await prisma.$disconnect();
