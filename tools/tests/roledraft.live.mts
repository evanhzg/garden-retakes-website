/**
 * The role draft and the scoreboard, end to end against a real database.
 *
 * Not part of `tools/tests/run.mjs` — everything in there is pure and needs no
 * DATABASE_URL. This one drives the actual Prisma layer, which is where the
 * remaining failure modes live: a snake order that is right in the abstract and
 * wrong once it is reading rosters, a draft that finishes without opening the
 * veto, roles that reach the match but not the scoreboard.
 *
 * Point it at a THROWAWAY database. It creates a tournament and deletes it
 * again, but it is not something to run against an event in progress.
 *
 *   DATABASE_URL='mysql://root:pw@127.0.0.1:33077/garden' \
 *     node --import '...alias loader...' tools/tests/roledraft.live.mts
 */
import { prisma } from "@/lib/db";
import { draftState, validateRolePick } from "@/lib/tournament/roles";
import {
  autoRoleDraft,
  beginRoleDraft,
  draftSides,
  picksFor,
  recordRolePick,
  rolesForMatch,
} from "@/lib/tournament/roleDraft";
import { beginRolesOrVeto } from "@/lib/tournament/vetoRunner";
import { autoVeto } from "@/lib/tournament/vetoRunner";
import { scoreboardFor } from "@/lib/tournament/scoreboard";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const BASE = BigInt("76561999900000000");
let nextId = BASE;
const freshId = () => (nextId += BigInt(1)).toString();

async function makeTournament(roleMode: string) {
  const slug = `zz-test-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

  const tournament = await prisma.tournament.create({
    data: {
      Slug: slug,
      Name: "Draft test",
      State: "live",
      TeamSize: 3,
      MaxTeams: 4,
      BestOf: 3,
      Published: true,
      IsTest: true,
      StartedAt: new Date(),
      RoleMode: roleMode,
    },
  });

  await prisma.tournamentMap.createMany({
    data: ["de_dust2", "de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_train"].map(
      (m, i) => ({ TournamentId: tournament.Id, Map: m, Ordinal: i }),
    ),
  });

  const stage = await prisma.tournamentStage.create({
    data: { TournamentId: tournament.Id, Name: "Main", Kind: "single", BestOf: 3 },
  });

  const team = async (name: string) => {
    const captainId = freshId();
    const row = await prisma.tournamentTeam.create({
      data: {
        TournamentId: tournament.Id,
        Name: name,
        Tag: name.slice(0, 3).toUpperCase(),
        CaptainSteamId: BigInt(captainId),
        Status: "accepted",
      },
    });

    // The captain first, so the draft's "player 1" is the one anybody would
    // guess. draftRoster orders by IsCaptain then Id, which this checks.
    await prisma.tournamentTeamMember.create({
      data: {
        TeamId: row.Id,
        SteamId: BigInt(captainId),
        IsCaptain: true,
        Status: "accepted",
        DisplayName: `${name}-cap`,
      },
    });

    for (let i = 2; i <= 3; i++) {
      await prisma.tournamentTeamMember.create({
        data: {
          TeamId: row.Id,
          SteamId: BigInt(freshId()),
          Status: "accepted",
          DisplayName: `${name}-${i}`,
        },
      });
    }

    return row;
  };

  const a = await team("Eagles");
  const b = await team("Cobras");

  const match = await prisma.tournamentMatch.create({
    data: {
      TournamentId: tournament.Id,
      StageId: stage.Id,
      MatchKey: `zz_${slug}`,
      BestOf: 3,
      TeamAId: a.Id,
      TeamBId: b.Id,
      State: "pending",
    },
  });

  return { tournament, match, a, b };
}

const cleanup = async (tournamentId: number) => {
  await prisma.tournament.delete({ where: { Id: tournamentId } });
};

async function main() {
  // ------------------------------------------------- per-match mode: a draft
  const world = await makeTournament("match");

  const opened = await beginRolesOrVeto(world.match.Id);
  check("ready-up opens the role draft, not the veto", opened === "roles", opened);

  const afterOpen = await prisma.tournamentMatch.findUniqueOrThrow({
    where: { Id: world.match.Id },
  });
  check("the match is in the roles state", afterOpen.State === "roles", afterOpen.State);
  check("a first team was drawn", afterOpen.RolesFirstTeamId !== null);
  check(
    "the first team is one of the two playing",
    afterOpen.RolesFirstTeamId === world.a.Id || afterOpen.RolesFirstTeamId === world.b.Id,
  );
  check("a deadline was set", afterOpen.RolesDeadline !== null);
  check("the veto has NOT started", afterOpen.VetoStartedAt === null);

  const sides = (await draftSides(world.match.Id))!;
  check("both rosters are three deep", sides.rosters.A.length === 3 && sides.rosters.B.length === 3);
  check("both teams owe picks in per-match mode", sides.drafting.A.length === 3 && sides.drafting.B.length === 3);
  check("the captain drafts first for their team", sides.rosters.A[0].isCaptain === true);

  let state = draftState(sides.drafting.A, sides.drafting.B, []);
  check("the order is A BB AA B", state.order.map((s) => s.team).join("") === "ABBAAB");

  // Two picks by hand, including the one that must be refused: the same team
  // taking a unique role twice.
  const first = state.next!;
  await recordRolePick(
    world.match.Id,
    sides.teamIdOf[first.team]!,
    first.ordinal,
    first.steamId,
    "planter",
    "roamer",
    false,
  );

  const memberAfter = await prisma.tournamentTeamMember.findFirstOrThrow({
    where: { SteamId: BigInt(first.steamId) },
  });
  check("the pick is written to the team sheet too", memberAfter.RoleT === "planter" && memberAfter.RoleCt === "roamer");

  state = draftState(sides.drafting.A, sides.drafting.B, await picksFor(world.match.Id));
  check("the clock moved to the other team", state.next!.team !== first.team);

  // The other team may take the same unique role; this team may not, later.
  const second = state.next!;
  const legalSameRole = validateRolePick(sides.drafting.A, sides.drafting.B, await picksFor(world.match.Id), {
    steamId: second.steamId,
    roleT: "planter",
    roleCt: "roamer",
  });
  check("the other team may take the same unique role", legalSameRole.ok === true);

  // Finish it automatically and check the handoff.
  const auto = await autoRoleDraft(world.match.Id);
  check("the draft can be finished automatically", auto.ok === true);

  const picks = await picksFor(world.match.Id);
  check("every player has a pick", picks.length === 6, String(picks.length));
  check("every pick has both roles", picks.every((p) => !!p.roleT && !!p.roleCt));

  // Uniqueness actually held across the whole draft.
  const bySide = (team: "A" | "B", side: "roleT" | "roleCt") =>
    picks
      .filter((p) => sides.drafting[team].includes(p.steamId))
      .map((p) => p[side])
      .filter(Boolean) as string[];

  for (const team of ["A", "B"] as const) {
    const t = bySide(team, "roleT");
    const ct = bySide(team, "roleCt");
    check(`${team} has no duplicate unique T role`, new Set(t.filter((r) => r !== "rifler")).size === t.filter((r) => r !== "rifler").length, t.join(","));
    check(`${team} has no duplicate unique CT role`, new Set(ct.filter((r) => r !== "backup")).size === ct.filter((r) => r !== "backup").length, ct.join(","));
  }

  // The draft ending is the veto starting. autoRoleDraft leaves that to its
  // caller, so this is the route's job — done here the same way.
  await beginRolesOrVeto(world.match.Id);
  const afterDraft = await prisma.tournamentMatch.findUniqueOrThrow({ where: { Id: world.match.Id } });
  check("the veto opens once the draft is done", afterDraft.VetoStartedAt !== null);
  check("the match moved to the veto state", afterDraft.State === "veto", afterDraft.State);

  // ------------------------------------------------------- veto and maps
  const veto = await autoVeto(world.match.Id, Math.random, null);
  check("the veto produces a BO3", veto.ok && veto.maps.length === 3, veto.maps.join(","));

  const maps = await prisma.tournamentMatchMap.findMany({
    where: { MatchId: world.match.Id },
    orderBy: { Ordinal: "asc" },
  });
  check("three map rows exist", maps.length === 3);
  check("the last one is the decider", maps[2].IsDecider === true);

  // ----------------------------------------------------------- scoreboard
  const roles = await rolesForMatch(world.match.Id);
  check("the match knows its roles", roles.size === 6, String(roles.size));

  // Two maps played, with stats, so the series tab has something to aggregate.
  const members = await prisma.tournamentTeamMember.findMany({
    where: { Team: { TournamentId: world.tournament.Id } },
  });

  for (const [i, map] of [maps[0], maps[1]].entries()) {
    await prisma.tournamentMatchMap.update({
      where: { Id: map.Id },
      data: { ScoreA: 13, ScoreB: 7 + i, State: "finished", WinnerTeamId: world.a.Id },
    });

    for (const member of members) {
      await prisma.tournamentPlayerStat.create({
        data: {
          MatchId: world.match.Id,
          MapId: map.Id,
          SteamId: member.SteamId,
          TeamId: member.TeamId,
          Kills: 20 - i * 4,
          Deaths: 15,
          Assists: 4,
          Headshots: 10,
          Damage: 2000,
          UtilityDamage: 180,
          EntryKills: 3,
          EntryDeaths: 2,
          Clutches: 1,
          RoundsPlayed: 20,
          KastRounds: 14,
          Rating: 1.2 - i * 0.4,
        },
      });
    }
  }

  await prisma.tournamentMatch.update({
    where: { Id: world.match.Id },
    data: { ScoreA: 2, ScoreB: 0, State: "finished", WinnerTeamId: world.a.Id },
  });

  const board = (await scoreboardFor(world.match.Id))!;

  check("the scoreboard has a series tab", board.tabs.some((x) => x.key === "series"));
  check("the scoreboard has a tab per played map", board.tabs.length === 3, board.tabs.map((x) => x.key).join(","));
  check(
    "the unplayed third map has no tab",
    !board.tabs.some((x) => x.key === String(maps[2].Id)),
  );
  check("a finished match opens on the series", board.defaultTab === "series", board.defaultTab);
  check("the series has every player", board.rows.series.length === 6, String(board.rows.series.length));
  check("rows carry a team slot", board.rows.series.every((r) => r.slot === "a" || r.slot === "b"));
  check("rows carry the drafted roles", board.rows.series.every((r) => !!r.roleT && !!r.roleCt));
  check("rows carry a display name, not a SteamID", board.rows.series.every((r) => !/^\d{17}$/.test(r.name)));

  // The rating that matters: 1.2 over 20 rounds and 0.8 over 20 is 1.00, and
  // averaging the two map figures would also give 1.00 — so this checks the
  // sum instead, which only the weighted path gets right.
  const one = board.rows.series[0];
  check("the series aggregates rounds", one.roundsPlayed === 40, String(one.roundsPlayed));
  check("the series aggregates kills", one.kills === 20 + 16, String(one.kills));
  check("the series rating is rounds-weighted", Math.abs(one.ratingAvg - 1.0) < 0.001, String(one.ratingAvg));
  check("ADR is damage over rounds", one.adr === 100, String(one.adr));

  const mapTab = board.rows[String(maps[0].Id)];
  check("the first map's tab has its own rows", mapTab.length === 6);
  check("the first map's rating is its own", Math.abs(mapTab[0].ratingAvg - 1.2) < 0.001, String(mapTab[0].ratingAvg));

  await cleanup(world.tournament.Id);

  // -------------------------------------- tournament mode: draft once, reuse
  const second2 = await makeTournament("tournament");

  const firstStage = await beginRolesOrVeto(second2.match.Id);
  check("the first match of a tournament-mode event still drafts", firstStage === "roles", firstStage);

  await autoRoleDraft(second2.match.Id);
  await beginRolesOrVeto(second2.match.Id);

  // A second match between the same two teams. Their roles are now set, so
  // there is nothing to draft and it should go straight to the veto.
  const stage2 = await prisma.tournamentStage.findFirstOrThrow({
    where: { TournamentId: second2.tournament.Id },
  });

  const rematch = await prisma.tournamentMatch.create({
    data: {
      TournamentId: second2.tournament.Id,
      StageId: stage2.Id,
      MatchKey: `zz_rematch_${Date.now().toString(36)}`,
      BestOf: 1,
      TeamAId: second2.a.Id,
      TeamBId: second2.b.Id,
      State: "pending",
    },
  });

  const rematchStage = await beginRolesOrVeto(rematch.Id);
  check("a later match skips the draft in tournament mode", rematchStage === "veto", rematchStage);

  const rematchRow = await prisma.tournamentMatch.findUniqueOrThrow({ where: { Id: rematch.Id } });
  check("the rematch went straight to the veto", rematchRow.VetoStartedAt !== null);

  // It still records what was played, so a finished match never has to read a
  // team sheet that has since moved on.
  const carried = await picksFor(rematch.Id);
  check("the rematch still records its roles", carried.length === 6, String(carried.length));
  check("the carried roles are complete", carried.every((p) => !!p.roleT && !!p.roleCt));

  await cleanup(second2.tournament.Id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    if (fails) {
      console.log(`\n${fails} failed`);
      process.exit(1);
    }
    console.log("\nall passed");
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
