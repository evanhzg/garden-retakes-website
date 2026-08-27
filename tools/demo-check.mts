/**
 * What the demo tournaments actually contain.
 *
 *   node --import ./tools/_alias-loader.mjs tools/demo-check.mts
 *
 * Read-only. Exists because "the simulation reported 8 maps" and "the veto ran
 * and picked varied maps with real side choices" are different claims, and only
 * the second one means the flow works.
 */
import { prisma } from "@/lib/db";
import { tournamentPlayerNames } from "@/lib/tournament/playerNames";

for (const slug of ["demo-finished", "demo-running"]) {
  const t = await prisma.tournament.findUnique({
    where: { Slug: slug },
    select: { Id: true, Name: true, State: true },
  });
  if (!t) continue;

  console.log(`\n── ${t.Name} (${t.State})`);

  const veto = await prisma.tournamentVetoAction.count({
    where: { Match: { TournamentId: t.Id } },
  });
  const maps = await prisma.tournamentMatchMap.findMany({
    where: { Match: { TournamentId: t.Id } },
    select: { Map: true, StartSideTeamA: true, IsDecider: true },
  });

  const spread = new Map<string, number>();
  for (const m of maps) spread.set(m.Map, (spread.get(m.Map) ?? 0) + 1);

  console.log(`   veto actions : ${veto}`);
  console.log(`   maps played  : ${maps.length} across ${spread.size} distinct`);
  console.log(
    `   spread       : ${[...spread.entries()].map(([m, n]) => `${m.replace("de_", "")}×${n}`).join(", ")}`,
  );
  console.log(`   sides chosen : ${maps.filter((m) => m.StartSideTeamA).length}/${maps.length}`);

  // Names, which is the other thing that was wrong: a raw SteamID64 on every
  // roster and stats row for anybody without a ladder profile.
  const names = await tournamentPlayerNames(t.Id);
  const values = Object.values(names);
  const numeric = values.filter((n) => /^\d{17}$/.test(n)).length;
  console.log(`   names        : ${values.length} players, ${numeric} still showing a SteamID`);
  console.log(`   sample       : ${values.slice(0, 5).join(", ")}`);
}

await prisma.$disconnect();
