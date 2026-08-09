import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const evanSteamId = BigInt("76561198154541270");

  console.log("Seeding evan profile...");

  // 1. Create PlayerProfile
  await prisma.playerProfile.upsert({
    where: { SteamId: evanSteamId },
    update: {
      LastKnownName: 'evan',
      LastSeenAtUtc: new Date(),
    },
    create: {
      SteamId: evanSteamId,
      LastKnownName: 'evan',
      FirstSeenAtUtc: new Date(),
      LastSeenAtUtc: new Date(),
    },
  });

  // 2. Create Web Profile
  await prisma.gardenWebProfile.upsert({
    where: { SteamId: evanSteamId },
    update: {},
    create: {
      SteamId: evanSteamId,
      Bio: 'Creator',
    },
  });

  // 3. Create Season Stats
  const activeSeason = await prisma.season.findFirst({
    where: { IsActive: true },
    orderBy: { Id: 'desc' },
  });

  if (!activeSeason) {
    console.error("No active season found");
    return;
  }

  await prisma.playerSeasonStats.upsert({
    where: {
      SeasonId_SteamId: {
        SeasonId: activeSeason.Id,
        SteamId: evanSteamId,
      },
    },
    update: {
      Elo: 1550,
      PeakElo: 1600,
      RankedRoundsPlayed: 150,
      RankedRoundsWon: 85,
      UnrankedRoundsPlayed: 0,
      UpdatedAtUtc: new Date(),
      IsCalibrating: false,
    },
    create: {
      SeasonId: activeSeason.Id,
      SteamId: evanSteamId,
      Elo: 1550,
      PeakElo: 1600,
      RankedRoundsPlayed: 150,
      RankedRoundsWon: 85,
      UnrankedRoundsPlayed: 0,
      UpdatedAtUtc: new Date(),
      IsCalibrating: false,
    },
  });

  // 4. Generate Round Records (~150 rounds, corresponding to 10 matches)
  // We'll create random rounds with slightly above-average stats
  console.log("Generating 150 rounds of player records...");

  const roundRecords = [];
  const maps = ["de_mirage", "de_inferno", "de_overpass", "de_nuke", "de_dust2"];

  let lastRoundAtUtc = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3); // 3 days ago

  for (let m = 0; m < 10; m++) { // 10 matches
    const map = maps[m % maps.length];
    
    // Each match has ~15 rounds
    for (let r = 0; r < 15; r++) {
      lastRoundAtUtc = new Date(lastRoundAtUtc.getTime() + 1000 * 60 * 2); // 2 minutes per round
      
      const wonRound = Math.random() > 0.45; // slightly favored to win
      const kills = Math.random() > 0.6 ? 1 : (Math.random() > 0.8 ? 2 : 0); // ~0.8 kpr
      const died = Math.random() > 0.3; // ~70% death rate
      const damage = kills * 100 + Math.floor(Math.random() * 50); // ~85 adr
      const hs = kills > 0 ? (Math.random() > 0.5 ? 1 : 0) : 0; // ~50% hs rate
      const rating = 0.8 + (kills * 0.4) - (died ? 0.2 : 0) + (damage > 100 ? 0.2 : 0); // ~1.1 to 1.3 rating

      roundRecords.push({
        RoundRecordId: BigInt(Date.now() * 1000 + m * 100 + r), // Fake unique round ID
        SeasonId: activeSeason.Id,
        Map: map,
        PlayedAtUtc: lastRoundAtUtc,
        IsRanked: true,
        SteamId: evanSteamId,
        PlayerName: 'evan',
        TeamNum: Math.random() > 0.5 ? 2 : 3,
        WonRound: wonRound,
        Kills: kills,
        Headshots: hs,
        Assists: Math.random() > 0.8 ? 1 : 0,
        FlashAssists: 0,
        Damage: damage,
        UtilityDamage: Math.floor(Math.random() * 10),
        EnemiesFlashed: 0,
        EnemyBlindDuration: 0,
        Died: died,
        WasTeamKilled: false,
        KilledTeammate: false,
        DiedEarly: false,
        OpeningKill: Math.random() > 0.9,
        OpeningDeath: Math.random() > 0.9,
        TradeKills: Math.random() > 0.8 ? 1 : 0,
        TradedDeath: false,
        Kast: kills > 0 || !died || Math.random() > 0.7,
        MultiKillCount: kills > 1 ? 1 : 0,
        ClutchVersus: 0,
        ClutchWon: false,
        BombPlanted: false,
        BombDefused: false,
        WasAfk: false,
        Rating: rating,
        EloDelta: wonRound ? 5 : -5,
        EloAfter: 1500,
        KilledTeammateAfterDecided: false,
      });
    }
  }

  // Insert in batches
  for (const chunk of chunkArray(roundRecords, 50)) {
    await prisma.playerRoundRecord.createMany({
      data: chunk,
    });
  }

  console.log("Seeding complete.");
}

function chunkArray(array: any[], size: number) {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
