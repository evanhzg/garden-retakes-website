/**
 * Prove the head-to-head numbers are real.
 *
 *   node --import ./tools/_alias-loader.mjs tools/versus-check.mts
 *
 * Finds a map and a pair of players who have actually killed each other, then
 * prints the same two counts /api/versus computes. Read-only.
 *
 * Exists because "the endpoint returns 200" and "the endpoint returns the right
 * numbers" are different claims, and only the second one is worth shipping.
 */
import { prisma } from "@/lib/db";

const busiest = await prisma.gardenHeatmap.groupBy({
  by: ["MapName"],
  _count: { _all: true },
  orderBy: { _count: { MapName: "desc" } },
  take: 3,
});

if (busiest.length === 0) {
  console.log("No kill rows at all — !vs will correctly say nobody has traded a kill.");
} else {
  for (const { MapName, _count } of busiest) {
    console.log(`\n── ${MapName}  (${_count._all} kills recorded)`);

    // A pair that has met on this map, in one direction.
    const pair = await prisma.gardenHeatmap.groupBy({
      by: ["AttackerSteamId", "VictimSteamId"],
      where: { MapName },
      _count: { _all: true },
      orderBy: { _count: { AttackerSteamId: "desc" } },
      take: 1,
    });

    if (pair.length === 0) {
      console.log("   no pairs");
      continue;
    }

    const me = pair[0].AttackerSteamId;
    const them = pair[0].VictimSteamId;

    const [mine, theirs] = await Promise.all([
      prisma.gardenHeatmap.count({
        where: { MapName, AttackerSteamId: me, VictimSteamId: them },
      }),
      prisma.gardenHeatmap.count({
        where: { MapName, AttackerSteamId: them, VictimSteamId: me },
      }),
    ]);

    const names = await prisma.playerProfile.findMany({
      where: { SteamId: { in: [me, them] } },
      select: { SteamId: true, LastKnownName: true },
    });
    const nameOf = new Map(names.map((n) => [n.SteamId.toString(), n.LastKnownName ?? ""]));

    const a = nameOf.get(me.toString()) || me.toString();
    const b = nameOf.get(them.toString()) || them.toString();

    console.log(`   ${a}  ${mine} - ${theirs}  ${b}`);
    console.log(`   ids: me=${me} them=${them}`);

    // The global tally, for contrast — the reason this reads GardenHeatmaps
    // rather than NemesisRecords.
    const overall = await prisma.nemesisRecord.findUnique({
      where: { KillerSteamId_VictimSteamId: { KillerSteamId: me, VictimSteamId: them } },
      select: { Kills: true },
    });
    console.log(`   same pair, all maps: ${overall?.Kills ?? "no row"}`);
  }
}

await prisma.$disconnect();
