#!/usr/bin/env node
/**
 * Clears every tournament and stands up one fresh test event in its place.
 *
 *   node --import ./tools/_alias-loader.mjs tools/reset-tournaments.mts             # dry run
 *   node --import ./tools/_alias-loader.mjs tools/reset-tournaments.mts --apply
 *
 * Destructive on purpose and narrow on purpose. It deletes Tournaments — which
 * cascades to their stages, teams, members, matches, maps, veto actions, role
 * picks, spectators and organizers — and it touches nothing else. The global
 * organizer registry, the admin table, the player profiles and the ladder's own
 * data are all outside a tournament and are all left alone.
 *
 * Servers are released as part of the same run, because a server row pointing
 * at a match that no longer exists is a server the fleet has quietly lost: it
 * stays "busy" for ever and the next bracket draws from a smaller pool.
 */
import fs from "node:fs";

for (const line of fs.readFileSync("/home/evan/projects/Garden-website/.env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const apply = process.argv.includes("--apply");
const say = (s: string) => console.log(apply ? s : `${s}  [dry run]`);

const { prisma } = await import("@/lib/db");
const { addBotTeam } = await import("@/lib/tournament/bots");

const NAME = "BOT WORLD CUP";
const SLUG = "bot-world-cup";
const TEAMS = 8;
const TEAM_SIZE = 3;

/** The pool the veto runs on. Only de_dust2 has authored tournament spawns. */
const POOL = ["de_dust2", "de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_train"];

// ---------------------------------------------------------------- inventory

const existing = await prisma.tournament.findMany({ orderBy: { Id: "asc" } });
console.log(`Tournaments to remove: ${existing.length}`);
for (const t of existing) console.log(`  #${t.Id} "${t.Name}" (${t.Slug})`);

const owner = existing.find((t) => t.OwnerSteamId)?.OwnerSteamId ?? null;
console.log(`\nOwner carried forward: ${owner ?? "(none found — will be unowned)"}`);

// ------------------------------------------------------------------ release

const busy = await prisma.gameServer.findMany({ where: { CurrentMatchId: { not: null } } });
for (const s of busy) {
  say(`release server #${s.Id} ${s.Name} (was on match ${s.CurrentMatchId})`);
}

if (apply) {
  await prisma.gameServer.updateMany({
    where: { IsTournament: true },
    data: { Status: "idle", CurrentMatchId: null },
  });
}

// ------------------------------------------------------------------- delete

for (const t of existing) {
  say(`delete tournament #${t.Id} "${t.Name}"`);
  if (apply) await prisma.tournament.delete({ where: { Id: t.Id } });
}

/**
 * Sweep up everything the delete did not take.
 *
 * schema.prisma declares `onDelete: Cascade` on these relations, but this
 * database has no foreign keys behind them — the relation is what Prisma joins
 * on, not something the server enforces. So deleting a Tournament removes one
 * row and leaves its entire tree standing. Measured here after removing four
 * tournaments: 25 teams, 14 matches, 3 stages and 28 map rows still pointing at
 * ids that no longer existed.
 *
 * That is not only untidy. `allTournamentStats()` reads TournamentPlayerStat
 * with no tournament filter at all, so orphaned stat rows would keep appearing
 * in the career table for ever — a leaderboard counting matches from a
 * tournament nobody can open.
 *
 * Swept top-down, children before parents, recomputing what is live as it goes.
 */
async function sweepOrphans(): Promise<void> {
  const liveTournaments = new Set(
    (await prisma.tournament.findMany({ select: { Id: true } })).map((t) => t.Id),
  );

  const removed: string[] = [];
  const note = (n: number, what: string) => {
    if (n > 0) removed.push(`${n} ${what}`);
  };

  // Matches, and everything hanging off one.
  const deadMatches = (await prisma.tournamentMatch.findMany({ select: { Id: true, TournamentId: true } }))
    .filter((m) => !liveTournaments.has(m.TournamentId))
    .map((m) => m.Id);

  if (deadMatches.length > 0) {
    const where = { MatchId: { in: deadMatches } };
    note((await prisma.tournamentRolePick.deleteMany({ where })).count, "role picks");
    note((await prisma.tournamentVetoAction.deleteMany({ where })).count, "veto actions");
    note((await prisma.tournamentMatchMap.deleteMany({ where })).count, "match maps");
    note((await prisma.tournamentPlayerStat.deleteMany({ where })).count, "player stats");
    note((await prisma.tournamentMatch.deleteMany({ where: { Id: { in: deadMatches } } })).count, "matches");
  }

  // Teams, and their members.
  const deadTeams = (await prisma.tournamentTeam.findMany({ select: { Id: true, TournamentId: true } }))
    .filter((t) => !liveTournaments.has(t.TournamentId))
    .map((t) => t.Id);

  if (deadTeams.length > 0) {
    note(
      (await prisma.tournamentTeamMember.deleteMany({ where: { TeamId: { in: deadTeams } } })).count,
      "team members",
    );
    note((await prisma.tournamentTeam.deleteMany({ where: { Id: { in: deadTeams } } })).count, "teams");
  }

  // Everything else that names a tournament directly.
  const byTournament = { TournamentId: { notIn: [...liveTournaments] } };
  note((await prisma.tournamentStage.deleteMany({ where: byTournament })).count, "stages");
  note((await prisma.tournamentMap.deleteMany({ where: byTournament })).count, "map pool rows");
  note((await prisma.tournamentSpectator.deleteMany({ where: byTournament })).count, "spectators");
  note((await prisma.tournamentOrganizer.deleteMany({ where: byTournament })).count, "organizers");

  // A member whose team went in an earlier run, before this sweep existed.
  const liveTeams = new Set((await prisma.tournamentTeam.findMany({ select: { Id: true } })).map((t) => t.Id));
  const strayMembers = (await prisma.tournamentTeamMember.findMany({ select: { Id: true, TeamId: true } }))
    .filter((m) => !liveTeams.has(m.TeamId))
    .map((m) => m.Id);

  if (strayMembers.length > 0) {
    note(
      (await prisma.tournamentTeamMember.deleteMany({ where: { Id: { in: strayMembers } } })).count,
      "stray members",
    );
  }

  console.log(removed.length > 0 ? `swept ${removed.join(", ")}` : "nothing orphaned");
}

if (apply) {
  await sweepOrphans();
}

// ------------------------------------------------------------------- create

if (!apply) {
  console.log(`\nWould create "${NAME}" (${SLUG}): ${TEAMS} bot teams of ${TEAM_SIZE}, ${POOL.length} maps`);
  await prisma.$disconnect();
  process.exit(0);
}

const created = await prisma.tournament.create({
  data: {
    Slug: SLUG,
    Name: NAME,
    Description: "Every team is bots. For exercising the whole flow end to end.",
    State: "registration",
    TeamSize: TEAM_SIZE,
    MaxTeams: TEAMS,
    OwnerSteamId: owner,
    Format: "single",
    Seeding: "random",
    BestOf: 1,
    FinalBestOf: 3,
    Published: true,
    // The flag that unlocks bot teams and instant resolution, and that a real
    // event must never carry.
    IsTest: true,
    RoleMode: "tournament",
    SpectatorsPublic: true,
  },
});

console.log(`\ncreated tournament #${created.Id} "${created.Name}"`);

await prisma.tournamentMap.createMany({
  data: POOL.map((map, i) => ({ TournamentId: created.Id, Map: map, Ordinal: i })),
});
console.log(`  pool: ${POOL.join(", ")}`);

if (owner) {
  await prisma.tournamentOrganizer.create({
    data: { TournamentId: created.Id, SteamId: owner, Name: "evan", IsCreator: true },
  });
  console.log(`  organizer: ${owner}`);
}

for (let i = 0; i < TEAMS; i++) {
  const result = await addBotTeam(created.Id);
  if (!result.ok) {
    console.log(`  team ${i + 1}: FAILED ${result.error}`);
    break;
  }
}

const teams = await prisma.tournamentTeam.findMany({
  where: { TournamentId: created.Id },
  include: { Members: { orderBy: { Id: "asc" } } },
  orderBy: { Id: "asc" },
});

console.log(`\n  ${teams.length} teams:`);
for (const team of teams) {
  console.log(`    ${team.Name} [${team.Tag}] — ${team.Members.map((m) => m.DisplayName).join(", ")}`);
}

// The whole point of the rename: prove no two players share a name.
const names = teams.flatMap((t) => t.Members.map((m) => m.DisplayName ?? "?"));
const distinct = new Set(names);
console.log(
  `\n  ${names.length} bots, ${distinct.size} distinct names — ` +
    (names.length === distinct.size ? "no collisions" : "COLLISIONS REMAIN"),
);

await prisma.$disconnect();
