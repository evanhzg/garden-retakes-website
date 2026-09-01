import { prisma } from "@/lib/db";
import { aggregate, type PlayerTotals, type StatRow, type TournamentAppearance } from "@/lib/tournament/stats";
import { allPlayerNames, tournamentPlayerNames } from "@/lib/tournament/playerNames";
import { inWindow, lastMonthWindow } from "@/lib/tournament/honours";

// Fetching for lib/tournament/stats.ts. Kept apart from the arithmetic so the
// arithmetic can be tested without a database — see tools/tests/tstats.test.mts.

const asRow = (r: {
  SteamId: bigint;
  TeamId: number | null;
  Kills: number;
  Deaths: number;
  Assists: number;
  Headshots: number;
  Damage: number;
  UtilityDamage: number;
  EntryKills: number;
  EntryDeaths: number;
  Clutches: number;
  RoundsPlayed: number;
  KastRounds: number;
  Rating: number;
}): StatRow => ({
  steamId: r.SteamId.toString(),
  teamId: r.TeamId,
  kills: r.Kills,
  deaths: r.Deaths,
  assists: r.Assists,
  headshots: r.Headshots,
  damage: r.Damage,
  utilityDamage: r.UtilityDamage,
  entryKills: r.EntryKills,
  entryDeaths: r.EntryDeaths,
  clutches: r.Clutches,
  roundsPlayed: r.RoundsPlayed,
  kastRounds: r.KastRounds,
  rating: r.Rating,
  maps: 1,
});

/** Every player's line for one tournament, best first. */
export async function tournamentStats(tournamentId: number): Promise<PlayerTotals[]> {
  const rows = await prisma.tournamentPlayerStat.findMany({
    where: { Match: { TournamentId: tournamentId } },
  });

  if (rows.length === 0) return [];

  // The plugin reports SteamIDs, not team ids, so a row's TeamId is often null.
  // The roster is the authority on who played for whom.
  const members = await prisma.tournamentTeamMember.findMany({
    where: { Team: { TournamentId: tournamentId } },
    select: { SteamId: true, TeamId: true },
  });
  const teamOf = new Map(members.map((m) => [m.SteamId.toString(), m.TeamId]));

  // Tournament display names first, profile names second, id last. Reading
  // only the profile put a raw SteamID64 on the stats table for every player
  // without a ladder history — and for every bot, which has no profile at all.
  const names = await tournamentPlayerNames(tournamentId);

  return aggregate(
    rows.map((r) => {
      const row = asRow(r);
      return { ...row, teamId: row.teamId ?? teamOf.get(row.steamId) ?? null };
    }),
    names,
  );
}

/**
 * Every player's line across every tournament, best first.
 *
 * The same aggregation as `tournamentStats`, without the tournament filter, so
 * the numbers are the rounds-weighted ones rather than an average of averages.
 * `teamId` stays null here on purpose: a player's team is a per-tournament
 * fact, and carrying one of them into a career table would be arbitrary.
 */
export async function allTournamentStats(minRounds = 0): Promise<PlayerTotals[]> {
  const rows = await prisma.tournamentPlayerStat.findMany();
  if (rows.length === 0) return [];

  const names = await allPlayerNames(Array.from(new Set(rows.map((r) => r.SteamId))));

  const totals = aggregate(
    rows.map((r) => ({ ...asRow(r), teamId: null })),
    names,
  );

  return minRounds > 0 ? totals.filter((p) => p.roundsPlayed >= minRounds) : totals;
}

/**
 * One player's record, one line per tournament they appeared in.
 *
 * Ordered newest first, because a profile is read as "what have they been doing
 * lately" far more often than as a career table.
 */
export async function playerTournamentHistory(steamId: string): Promise<TournamentAppearance[]> {
  let id: bigint;
  try {
    id = BigInt(steamId);
  } catch {
    return [];
  }

  const rows = await prisma.tournamentPlayerStat.findMany({
    where: { SteamId: id },
    include: {
      Match: {
        select: {
          TournamentId: true,
          Tournament: { select: { Slug: true, Name: true, State: true } },
        },
      },
    },
  });

  if (rows.length === 0) return [];

  const memberships = await prisma.tournamentTeamMember.findMany({
    where: { SteamId: id },
    include: { Team: { select: { Id: true, Name: true, TournamentId: true } } },
  });
  const teamIn = new Map(memberships.map((m) => [m.Team.TournamentId, m.Team]));

  const byTournament = new Map<number, StatRow[]>();
  const meta = new Map<number, { slug: string; name: string; state: string }>();

  for (const row of rows) {
    const tid = row.Match.TournamentId;
    const list = byTournament.get(tid) ?? [];
    list.push(asRow(row));
    byTournament.set(tid, list);
    meta.set(tid, {
      slug: row.Match.Tournament.Slug,
      name: row.Match.Tournament.Name,
      state: row.Match.Tournament.State,
    });
  }

  const out: TournamentAppearance[] = [];

  for (const [tournamentId, statRows] of Array.from(byTournament.entries())) {
    const info = meta.get(tournamentId)!;
    const totals = aggregate(statRows)[0];
    if (!totals) continue;

    out.push({
      tournamentId,
      slug: info.slug,
      name: info.name,
      state: info.state,
      teamName: teamIn.get(tournamentId)?.Name ?? null,
      placement: null,
      totals,
    });
  }

  return out.sort((a, b) => b.tournamentId - a.tournamentId);
}

/**
 * Everything the stats hub shows, from one query.
 *
 * The page needs four different cuts of the same rows: the career table, a
 * table per tournament, last month's table, and the tournaments themselves.
 * Asking the database four times — or once per tournament, which is what a
 * loop over `tournamentStats` would do — is four round trips for rows that are
 * already in memory after the first. So the join comes back once carrying the
 * tournament and the end time, and the grouping happens here.
 *
 * `EndedAt` is the match's, not the tournament's: a tournament has no end
 * column, and the last match to finish is what "when did it happen" means.
 */
export type HubTournament = {
  id: number;
  slug: string;
  name: string;
  state: string;
  startsAt: Date | null;
  endedAt: Date | null;
  players: PlayerTotals[];
  rounds: number;
  /** How many teams entered. */
  teams: number;
  /** Who won it, or null while it is still being played. */
  champion: string | null;
};

export async function statsHubData(): Promise<{
  overall: PlayerTotals[];
  lastMonth: PlayerTotals[];
  tournaments: HubTournament[];
}> {
  const rows = await prisma.tournamentPlayerStat.findMany({
    include: {
      Match: {
        select: {
          TournamentId: true,
          EndedAt: true,
          Tournament: {
            select: { Slug: true, Name: true, State: true, StartsAt: true },
          },
        },
      },
    },
  });

  if (rows.length === 0) return { overall: [], lastMonth: [], tournaments: [] };

  const names = await allPlayerNames(Array.from(new Set(rows.map((r) => r.SteamId))));

  const window = lastMonthWindow(new Date());
  const monthRows: StatRow[] = [];
  const byTournament = new Map<number, StatRow[]>();
  const meta = new Map<number, Omit<HubTournament, "players" | "rounds" | "teams" | "champion">>();

  for (const row of rows) {
    const stat = { ...asRow(row), teamId: null };
    const tid = row.Match.TournamentId;

    const list = byTournament.get(tid) ?? [];
    list.push(stat);
    byTournament.set(tid, list);

    if (!meta.has(tid)) {
      meta.set(tid, {
        id: tid,
        slug: row.Match.Tournament.Slug,
        name: row.Match.Tournament.Name,
        state: row.Match.Tournament.State,
        startsAt: row.Match.Tournament.StartsAt,
        endedAt: row.Match.EndedAt,
      });
    } else {
      // The tournament ended when its LAST match did.
      const seen = meta.get(tid)!;
      const at = row.Match.EndedAt;
      if (at && (!seen.endedAt || at > seen.endedAt)) seen.endedAt = at;
    }

    if (inWindow(row.Match.EndedAt, window)) monthRows.push(stat);
  }

  const ids = Array.from(byTournament.keys());

  /* Who won, and how many entered. Two small queries rather than two more
     joins on the big one: this is one row per tournament either way, and
     hanging them off the stat rows would repeat each answer once per player
     per map. */
  const teams = await prisma.tournamentTeam.findMany({
    where: { TournamentId: { in: ids } },
    select: { Id: true, Name: true, TournamentId: true },
  });
  const teamName = new Map(teams.map((x) => [x.Id, x.Name]));
  const teamCount = new Map<number, number>();
  for (const x of teams) teamCount.set(x.TournamentId, (teamCount.get(x.TournamentId) ?? 0) + 1);

  /* The last match to finish is the final. Ordering by EndedAt rather than by
     the bracket round because "highest round number" is only the final in
     single elimination — a double-elimination grand final and the last
     lower-bracket match can carry the same round, and a Swiss stage has no
     final at all, just a last game. */
  const decided = await prisma.tournamentMatch.findMany({
    where: { TournamentId: { in: ids }, WinnerTeamId: { not: null } },
    select: { TournamentId: true, WinnerTeamId: true, EndedAt: true, Round: true },
    orderBy: [{ EndedAt: "desc" }, { Round: "desc" }],
  });
  const championOf = new Map<number, string>();
  for (const m of decided) {
    if (championOf.has(m.TournamentId)) continue;
    const name = m.WinnerTeamId ? teamName.get(m.WinnerTeamId) : undefined;
    if (name) championOf.set(m.TournamentId, name);
  }

  const tournaments: HubTournament[] = Array.from(byTournament.entries()).map(([id, statRows]) => {
    const players = aggregate(statRows, names);
    const info = meta.get(id)!;
    return {
      ...info,
      players,
      // Rounds are per-player rows, so the tournament's round count is the
      // longest single line, not the sum — summing counts every round once
      // per player who was in it.
      rounds: players.reduce((n, p) => Math.max(n, p.roundsPlayed), 0),
      teams: teamCount.get(id) ?? 0,
      // Only a finished tournament has a champion. The last decided match of
      // one still being played is a quarter-final, and putting its winner on
      // the card would crown somebody mid-bracket.
      champion: info.state === "finished" ? championOf.get(id) ?? null : null,
    };
  });

  return {
    overall: aggregate(
      rows.map((r) => ({ ...asRow(r), teamId: null })),
      names,
    ),
    lastMonth: monthRows.length > 0 ? aggregate(monthRows, names) : [],
    tournaments,
  };
}
