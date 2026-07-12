import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const zywooSteamId = 76561198113666193; // Use ZywOo's actual SteamID or a fake big one

  console.log("Seeding ZywOo profile...");

  // 1. Create PlayerProfile
  await prisma.playerProfile.upsert({
    where: { SteamId: zywooSteamId },
    update: {
      LastKnownName: 'ZywOo',
      LastSeenAtUtc: new Date(),
    },
    create: {
      SteamId: zywooSteamId,
      LastKnownName: 'ZywOo',
      FirstSeenAtUtc: new Date('2024-01-01T00:00:00Z'),
      LastSeenAtUtc: new Date(),
    },
  });

  // 2. Create Web Profile
  await prisma.gardenWebProfile.upsert({
    where: { SteamId: zywooSteamId },
    update: {
      AvatarUrl: '/pros/zywoo_character/pp.png',
      Bio: 'Professional CS2 Player for Team Vitality',
      Country: 'FR',
      IsPro: true,
      ProSlug: 'zywoo',
    },
    create: {
      SteamId: zywooSteamId,
      AvatarUrl: '/pros/zywoo_character/pp.png',
      Bio: 'Professional CS2 Player for Team Vitality',
      Country: 'FR',
      IsPro: true,
      ProSlug: 'zywoo',
    },
  });

  // 3. Create Season Stats (fake stats)
  const activeSeason = await prisma.season.findFirst({
    where: { IsActive: true },
    orderBy: { Id: 'desc' },
  });

  if (activeSeason) {
    await prisma.playerSeasonStats.upsert({
      where: {
        SeasonId_SteamId: {
          SeasonId: activeSeason.Id,
          SteamId: zywooSteamId,
        },
      },
      update: {
        Elo: 3500,
        PeakElo: 3600,
        RankedRoundsPlayed: 500,
        RankedRoundsWon: 350,
        UnrankedRoundsPlayed: 100,
        UpdatedAtUtc: new Date(),
      },
      create: {
        SeasonId: activeSeason.Id,
        SteamId: zywooSteamId,
        Elo: 3500,
        PeakElo: 3600,
        RankedRoundsPlayed: 500,
        RankedRoundsWon: 350,
        UnrankedRoundsPlayed: 100,
        UpdatedAtUtc: new Date(),
      },
    });
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
