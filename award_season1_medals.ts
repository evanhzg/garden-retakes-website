import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const season1Id = 1;

  // define medals
  const ALL_MEDALS = [
    { slug: "season-first", name: "Champion", description: "Finished a season first on the ladder.", icon: "/medals/season-1-top-1.jpg", colour: "#e8b53a", kind: "season", sort: 1 },
    { slug: "season-second", name: "Runner-up", description: "Finished a season second on the ladder.", icon: "/medals/season-1-top-2.jpg", colour: "#b9c0c7", kind: "season", sort: 2 },
    { slug: "season-third", name: "Third place", description: "Finished a season third on the ladder.", icon: "/medals/season-1-top-3.jpg", colour: "#c98b4b", kind: "season", sort: 3 },
    { slug: "pre-season-1", name: "Pre-season 1 Participant", description: "Played in Pre-season 1.", icon: "/medals/pre-season-1.jpg", colour: "#5fc9c9", kind: "season", sort: 4 },
  ];

  for (const m of ALL_MEDALS) {
    await prisma.gardenMedal.upsert({
      where: { Slug: m.slug },
      create: {
        Slug: m.slug,
        Name: m.name,
        Description: m.description,
        Icon: m.icon,
        Colour: m.colour,
        Kind: m.kind,
        Sort: m.sort,
      },
      update: { Name: m.name, Description: m.description, Icon: m.icon, Colour: m.colour, Kind: m.kind, Sort: m.sort },
    });
  }

  // Hardcode top 3 players for Season 1 specifically to be: morgoth, trezza, frost.
  const winners = [
    { steamId: BigInt("76561199157876106"), slug: "season-first" },  // morgoth
    { steamId: BigInt("76561198030487372"), slug: "season-second" }, // trezza
    { steamId: BigInt("76561198115583644"), slug: "season-third" },  // frost
  ];

  // First, remove existing placement medals for Season 1 to prevent duplicates
  await prisma.gardenPlayerMedal.deleteMany({
    where: {
      SeasonId: season1Id,
      MedalSlug: { in: ["season-first", "season-second", "season-third"] }
    }
  });

  for (const w of winners) {
    console.log(`Awarding ${w.slug} to ${w.steamId}`);
    await prisma.gardenPlayerMedal.upsert({
      where: { SteamId_MedalSlug_SeasonId: { SteamId: w.steamId, MedalSlug: w.slug, SeasonId: season1Id } },
      create: { SteamId: w.steamId, MedalSlug: w.slug, SeasonId: season1Id, Note: `Season 1` },
      update: { Note: `Season 1` },
    });
  }

  // get all players who played in Season 1
  const allPlayers = await prisma.playerSeasonStats.findMany({
    where: { SeasonId: season1Id }
  });

  for (const p of allPlayers) {
    console.log(`Awarding pre-season-1 to ${p.SteamId}`);
    await prisma.gardenPlayerMedal.upsert({
      where: { SteamId_MedalSlug_SeasonId: { SteamId: p.SteamId, MedalSlug: "pre-season-1", SeasonId: season1Id } },
      create: { SteamId: p.SteamId, MedalSlug: "pre-season-1", SeasonId: season1Id, Note: "Pre-season 1" },
      update: { Note: "Pre-season 1" },
    });
  }

  console.log("Done.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
