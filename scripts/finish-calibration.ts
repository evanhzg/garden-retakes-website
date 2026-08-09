import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const steamId = BigInt("76561198154541270");

  const activeSeason = await prisma.season.findFirst({
    where: { IsActive: true },
    orderBy: { Id: 'desc' },
  });

  if (!activeSeason) {
    console.log("No active season found");
    return;
  }

  // Create 10 mock rounds
  const roundRecords = [];
  const now = new Date();
  
  for (let r = 0; r < 10; r++) {
    const kills = 2; // good stats
    const wonRound = true;
    roundRecords.push({
      RoundRecordId: BigInt(Date.now() * 1000 + r),
      SeasonId: activeSeason.Id,
      Map: "de_inferno",
      PlayedAtUtc: new Date(now.getTime() - r * 60000),
      IsRanked: true,
      SteamId: steamId,
      PlayerName: 'evan',
      TeamNum: 2,
      WonRound: wonRound,
      Kills: kills,
      Headshots: 1,
      Assists: 0,
      FlashAssists: 0,
      Damage: 250,
      UtilityDamage: 0,
      EnemiesFlashed: 0,
      EnemyBlindDuration: 0,
      Died: false,
      WasTeamKilled: false,
      KilledTeammate: false,
      DiedEarly: false,
      OpeningKill: true,
      OpeningDeath: false,
      TradeKills: 0,
      TradedDeath: false,
      Kast: true,
      MultiKillCount: 1,
      ClutchVersus: 0,
      ClutchWon: false,
      BombPlanted: false,
      BombDefused: false,
      WasAfk: false,
      Rating: 1.5,
      EloDelta: 10,
      EloAfter: 10600,
      KilledTeammateAfterDecided: false,
    });
  }

  await prisma.playerRoundRecord.createMany({
    data: roundRecords,
  });

  // Update PlayerSeasonStats
  const stats = await prisma.playerSeasonStats.findFirst({
    where: { SteamId: steamId }
  });

  if (stats) {
    await prisma.playerSeasonStats.update({
      where: { Id: stats.Id },
      data: {
        IsCalibrating: false,
        RankedRoundsPlayed: stats.RankedRoundsPlayed + 10,
        RankedRoundsWon: stats.RankedRoundsWon + 10
      }
    });
  }

  console.log("Inserted 10 ranked rounds and set IsCalibrating to false.");
}

main().finally(() => prisma.$disconnect());
