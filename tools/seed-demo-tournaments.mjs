#!/usr/bin/env node
/**
 * Two tournaments to look at: one finished, one in progress.
 *
 *   node tools/seed-demo-tournaments.mjs           create them
 *   node tools/seed-demo-tournaments.mjs --remove  delete them again
 *
 * Both are left UNPUBLISHED and flagged IsTest, which has two consequences and
 * both are the point. Unpublished means manageableTournamentIds() already
 * restricts them to owners, admins and organizers, so no visitor to the live
 * site meets a fake event with invented winners — and the public archive and
 * team rankings, which filter on Published, stay honest. IsTest means the bot
 * and simulation controls are available on them and nowhere else.
 *
 * Teardown is included and is not an afterthought: this schema has no
 * database-level foreign keys, so hand-written cleanup SQL deletes rows in an
 * order somebody has to get right, and getting it wrong leaves orphans that
 * only show up later as a bracket referencing a team that is gone.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUGS = ["demo-finished", "demo-running"];

const TEAMS = [
  ["Ashgrove", "ASH"], ["Blackpine", "BLK"], ["Coldwater", "CLD"], ["Drakemoor", "DRK"],
  ["Eastwind", "EST"], ["Fernhollow", "FRN"], ["Greyhaven", "GRY"], ["Highmark", "HGH"],
];

const NAMES = [
  "Rezan", "Darryl", "Rouchard", "Dragomir", "Arno", "Cavalry", "Baroud", "Getaway",
  "Enforcer", "Maximus", "Jaques", "Sox", "Trapper", "Vitesse", "Karol", "Nomad",
  "Pike", "Quill", "Renard", "Sable", "Talon", "Ulysse", "Vega", "Wren",
];

const POOL = ["de_dust2", "de_inferno", "de_mirage", "de_ancient", "de_nuke", "de_anubis", "de_cache"];

/** Same synthetic range as lib/tournament/bots.ts, far above any real account. */
const BOT_BASE = BigInt("76561999000000000");

async function remove() {
  const tournaments = await prisma.tournament.findMany({
    where: { Slug: { in: SLUGS } },
    select: { Id: true, Slug: true },
  });

  for (const t of tournaments) {
    // Children first, deepest first. No foreign keys means nothing cascades on
    // our behalf and the order is entirely on us.
    const matches = await prisma.tournamentMatch.findMany({
      where: { TournamentId: t.Id },
      select: { Id: true },
    });
    const matchIds = matches.map((m) => m.Id);

    const teams = await prisma.tournamentTeam.findMany({
      where: { TournamentId: t.Id },
      select: { Id: true },
    });
    const teamIds = teams.map((x) => x.Id);

    if (matchIds.length) {
      await prisma.tournamentPlayerStat.deleteMany({ where: { MatchId: { in: matchIds } } });
      await prisma.tournamentMatchMap.deleteMany({ where: { MatchId: { in: matchIds } } });
      await prisma.tournamentVetoAction.deleteMany({ where: { MatchId: { in: matchIds } } });
    }
    if (teamIds.length) {
      await prisma.tournamentTeamMember.deleteMany({ where: { TeamId: { in: teamIds } } });
    }

    await prisma.tournamentMatch.deleteMany({ where: { TournamentId: t.Id } });
    await prisma.tournamentTeam.deleteMany({ where: { TournamentId: t.Id } });
    await prisma.tournamentStage.deleteMany({ where: { TournamentId: t.Id } });
    await prisma.tournamentMap.deleteMany({ where: { TournamentId: t.Id } });
    await prisma.tournamentOrganizer.deleteMany({ where: { TournamentId: t.Id } });
    await prisma.tournament.delete({ where: { Id: t.Id } });

    console.log(`removed ${t.Slug}`);
  }

  if (tournaments.length === 0) console.log("nothing to remove");
}

async function createTournament({ slug, name, description, startsAt }) {
  const existing = await prisma.tournament.findUnique({ where: { Slug: slug } });
  if (existing) {
    console.log(`${slug} already exists — skipping`);
    return null;
  }

  const tournament = await prisma.tournament.create({
    data: {
      Slug: slug,
      Name: name,
      Description: description,
      State: "registration",
      // Staff only. The whole reason these are safe to put in a live database.
      Published: false,
      IsTest: true,
      Visibility: "public",
      MaxTeams: 8,
      TeamSize: 3,
      Format: "single",
      Seeding: "random",
      BestOf: 1,
      FinalBestOf: 3,
      StartsAt: startsAt,
      RulesText:
        "Demonstration event. Everything here is generated so the pages can be looked at with real-shaped data in them.",
      PrizeText: "1st — 300 EUR\n2nd — 150 EUR\n3rd — 50 EUR",
    },
  });

  await prisma.tournamentMap.createMany({
    data: POOL.map((map, i) => ({ TournamentId: tournament.Id, Map: map, Ordinal: i })),
  });

  let nextId = BOT_BASE + BigInt(1000);

  for (let i = 0; i < TEAMS.length; i++) {
    const [teamName, tag] = TEAMS[i];
    const captainId = nextId;

    const team = await prisma.tournamentTeam.create({
      data: {
        TournamentId: tournament.Id,
        Name: teamName,
        Tag: tag,
        CaptainSteamId: captainId,
        Status: "accepted",
        Seed: i + 1,
      },
    });

    const members = [];
    for (let p = 0; p < 3; p++) {
      members.push({
        TeamId: team.Id,
        SteamId: nextId,
        IsCaptain: p === 0,
        Status: "accepted",
        IsBot: true,
        DisplayName: NAMES[Number(nextId % BigInt(NAMES.length))],
        RespondedAt: new Date(),
      });
      nextId += BigInt(1);
    }

    await prisma.tournamentTeamMember.createMany({ data: members });
  }

  console.log(`created ${slug} (${TEAMS.length} teams, unpublished)`);
  return tournament;
}

async function main() {
  if (process.argv.includes("--remove")) {
    await remove();
    return;
  }

  const day = 86_400_000;

  await createTournament({
    slug: "demo-finished",
    name: "Garden Winter Cup",
    description: "A finished event, for checking how results and the archive read.",
    startsAt: new Date(Date.now() - 21 * day),
  });

  await createTournament({
    slug: "demo-running",
    name: "Garden Spring Series",
    description: "An event in progress, for checking the live bracket and match pages.",
    startsAt: new Date(Date.now() - 2 * 3_600_000),
  });

  console.log("");
  console.log("Both are unpublished, so only owners, admins and organizers see them.");
  console.log("To play them out, open each in the admin panel and use Start, then");
  console.log("Simulate — which runs every match through the same finishMap() the");
  console.log("plugin's ingest calls.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
