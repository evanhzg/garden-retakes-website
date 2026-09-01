import { prisma } from "@/lib/db";
import { decidingMatch } from "@/lib/tournament/edition";

// The tournaments hub: what has happened, what is happening, who is winning.
//
// All of it derived from tournament rows that already exist — no new tables and
// no denormalised standings, because a tournament fleet of this size can be
// aggregated on read and a cached table would be a second source of truth for
// facts the matches already hold.

export type ArchiveEntry = {
  id: number;
  slug: string;
  name: string;
  hasBanner: boolean;
  finishedAt: string | null;
  teamCount: number;
  format: string;
  teamSize: number;
  /** Best first. Usually three, fewer in a very small event. */
  podium: { place: number; teamId: number; name: string; tag: string | null }[];
};

export type TeamRanking = {
  name: string;
  tag: string | null;
  /**
   * The persistent team behind this row, when there is one.
   *
   * A ranking row is a NAME aggregated across events — TournamentTeam is one
   * roster in one tournament, so "Greyhaven Bots" in three tournaments is
   * three rows in the database and one row here. GardenTeam is the standing
   * team, and TournamentTeam.GardenTeamId is the link an entry keeps to it.
   * Null for a name that only ever existed inside a bracket, which is most of
   * them and not an error.
   */
  slug: string | null;
  tournaments: number;
  wins: number;
  matchesWon: number;
  matchesLost: number;
  roundsFor: number;
  roundsAgainst: number;
  diff: number;
};

export type ScheduledTournament = {
  id: number;
  slug: string;
  name: string;
  hasBanner: boolean;
  startsAt: string | null;
  teamCount: number;
  maxTeams: number;
  teamSize: number;
  state: string;
};


/**
 * Who finished where, read off the bracket.
 *
 * Pure, and exported, because two places need the answer and they must not
 * disagree: the archive card on the tournaments hub, and the results tab on the
 * tournament itself. A podium computed twice is a podium that eventually says
 * two different things about the same event.
 *
 * First is whoever won the last match; second is whoever lost it. Third is BOTH
 * losing semi-finalists, presented as a tie — a single-elimination bracket
 * without a third-place match never ranked them against each other, and putting
 * one above the other would be inventing a result nobody played for.
 */
export function podiumFrom(
  matches: { Round: number; TeamAId: number | null; TeamBId: number | null; WinnerTeamId: number | null }[],
  teams: { Id: number; Name: string; Tag: string | null }[],
): { place: number; teamId: number; name: string; tag: string | null }[] {
  if (matches.length === 0) return [];

  const finished = matches.filter((m) => m.WinnerTeamId !== null);
  if (finished.length === 0) return [];

  const teamById = new Map(teams.map((x) => [x.Id, x]));
  const named = (id: number | null) => (id === null ? null : teamById.get(id) ?? null);

  // Which match is the final is decided in lib/tournament/edition.ts, and only
  // there. The status shown on a tournament card asks the same question — "is
  // this over" — and two implementations of "the final is the single deepest
  // round" is how a card ends up saying In progress above a podium.
  const finalRound = Math.max(...matches.map((m) => m.Round));
  const final = decidingMatch(
    matches.map((m) => ({ round: m.Round, winnerTeamId: m.WinnerTeamId, row: m })),
  )?.row;

  if (!final) return [];

  // Not played yet: there is no podium, and saying so is the correct answer.
  if (!final.WinnerTeamId) return [];

  const out: { place: number; teamId: number; name: string; tag: string | null }[] = [];

  const winner = named(final.WinnerTeamId);
  const runnerUpId = final.WinnerTeamId === final.TeamAId ? final.TeamBId : final.TeamAId;
  const runnerUp = named(runnerUpId);

  if (winner) out.push({ place: 1, teamId: winner.Id, name: winner.Name, tag: winner.Tag });
  if (runnerUp) out.push({ place: 2, teamId: runnerUp.Id, name: runnerUp.Name, tag: runnerUp.Tag });

  for (const semi of finished.filter((m) => m.Round === finalRound - 1)) {
    if (!semi.WinnerTeamId) continue;
    const lostId = semi.WinnerTeamId === semi.TeamAId ? semi.TeamBId : semi.TeamAId;
    const lost = named(lostId);
    if (lost) out.push({ place: 3, teamId: lost.Id, name: lost.Name, tag: lost.Tag });
  }

  return out;
}

/**
 * Finished tournaments, newest first, each with its podium.
 *
 * The podium is read off the bracket rather than stored. First is whoever won
 * the last match; second is whoever lost it; third is the losing semi-finalists,
 * which in a single-elimination bracket without a third-place match is a tie
 * and is presented as one — inventing an ordering between them would be making
 * up a result nobody played for.
 */
export async function tournamentArchive(
  /**
   * Tournament ids this viewer manages, or null for "all of them".
   *
   * Same shape as manageableTournamentIds(), and here for the same reason the
   * tournaments list takes it: an organizer's own unpublished event is
   * invisible to everybody else but must not be invisible to them, or a
   * seeded demo they just played out appears to have vanished.
   */
  visible: number[] | null = [],
  limit = 20,
): Promise<ArchiveEntry[]> {
  const tournaments = await prisma.tournament.findMany({
    where: {
      State: "finished",
      ...(visible === null ? {} : { OR: [{ Published: true }, { Id: { in: visible } }] }),
    },
    orderBy: [{ StartsAt: "desc" }, { Id: "desc" }],
    take: limit,
    include: {
      Teams: { select: { Id: true, Name: true, Tag: true } },
      Matches: {
        // Every match, not only the finished ones. podiumFrom needs the
        // bracket's full depth to know which round IS the final — handed only
        // the finished ones it would call the deepest round played the final,
        // which is the bug it was just fixed for.
        orderBy: [{ Round: "desc" }, { Slot: "asc" }],
        select: {
          Round: true,
          TeamAId: true,
          TeamBId: true,
          WinnerTeamId: true,
        },
      },
      _count: { select: { Teams: true } },
    },
  });

  return tournaments.map((tournament) => {
    const podium = podiumFrom(tournament.Matches, tournament.Teams);

    return {
      id: tournament.Id,
      slug: tournament.Slug,
      name: tournament.Name,
      hasBanner: tournament.BannerImage !== null,
      finishedAt: tournament.StartsAt?.toISOString() ?? null,
      teamCount: tournament._count.Teams,
      format: tournament.Format,
      teamSize: tournament.TeamSize,
      podium,
    };
  });
}

/**
 * Teams ranked across every tournament.
 *
 * Grouped by NAME rather than by team id, because a team row belongs to one
 * tournament — the same five players entering three events are three rows, and
 * ranking those separately would answer a question nobody asked.
 */
export async function teamRankings(
  visible: number[] | null = [],
  limit = 25,
): Promise<TeamRanking[]> {
  const matches = await prisma.tournamentMatch.findMany({
    where: {
      State: "finished",
      ...(visible === null
        ? {}
        : { Tournament: { OR: [{ Published: true }, { Id: { in: visible } }] } }),
    },
    select: {
      TournamentId: true,
      TeamAId: true,
      TeamBId: true,
      ScoreA: true,
      ScoreB: true,
      WinnerTeamId: true,
      Round: true,
    },
  });

  if (matches.length === 0) return [];

  const teamIds = Array.from(
    new Set(matches.flatMap((m) => [m.TeamAId, m.TeamBId]).filter((x): x is number => x !== null)),
  );

  const teams = await prisma.tournamentTeam.findMany({
    where: { Id: { in: teamIds } },
    select: { Id: true, Name: true, Tag: true, TournamentId: true, GardenTeamId: true },
  });
  const teamById = new Map(teams.map((x) => [x.Id, x]));

  // One query for every standing team any of these entries points at.
  const gardenIds = Array.from(
    new Set(teams.map((x) => x.GardenTeamId).filter((x): x is number => x !== null)),
  );
  const slugById = new Map(
    gardenIds.length === 0
      ? []
      : (
          await prisma.gardenTeam.findMany({
            where: { Id: { in: gardenIds } },
            select: { Id: true, Slug: true },
          })
        ).map((x) => [x.Id, x.Slug] as const),
  );

  const byName = new Map<string, TeamRanking & { events: Set<number>; wonEvents: Set<number> }>();

  const entry = (id: number) => {
    const team = teamById.get(id);
    if (!team) return null;
    const key = team.Name.trim().toLowerCase();

    let row = byName.get(key);
    if (!row) {
      row = {
        name: team.Name,
        tag: team.Tag,
        slug: team.GardenTeamId ? slugById.get(team.GardenTeamId) ?? null : null,
        tournaments: 0,
        wins: 0,
        matchesWon: 0,
        matchesLost: 0,
        roundsFor: 0,
        roundsAgainst: 0,
        diff: 0,
        events: new Set(),
        wonEvents: new Set(),
      };
      byName.set(key, row);
    }
    row.events.add(team.TournamentId);
    // A name that was a standing team in ANY of its entries links to it: the
    // first appearance may predate the team being registered.
    if (!row.slug && team.GardenTeamId) row.slug = slugById.get(team.GardenTeamId) ?? null;
    return row;
  };

  // The final of each tournament, so a win can be attributed. Highest round
  // number wins — the bracket is built with round 1 first.
  const finalRoundOf = new Map<number, number>();
  for (const m of matches) {
    const best = finalRoundOf.get(m.TournamentId) ?? 0;
    if (m.Round > best) finalRoundOf.set(m.TournamentId, m.Round);
  }

  for (const m of matches) {
    for (const [id, own, other] of [
      [m.TeamAId, m.ScoreA, m.ScoreB],
      [m.TeamBId, m.ScoreB, m.ScoreA],
    ] as const) {
      if (id === null) continue;
      const row = entry(id);
      if (!row) continue;

      row.roundsFor += own;
      row.roundsAgainst += other;

      if (m.WinnerTeamId === id) {
        row.matchesWon++;
        if (finalRoundOf.get(m.TournamentId) === m.Round) row.wonEvents.add(m.TournamentId);
      } else if (m.WinnerTeamId !== null) {
        row.matchesLost++;
      }
    }
  }

  return Array.from(byName.values())
    .map((row) => ({
      name: row.name,
      tag: row.tag,
      slug: row.slug,
      tournaments: row.events.size,
      wins: row.wonEvents.size,
      matchesWon: row.matchesWon,
      matchesLost: row.matchesLost,
      roundsFor: row.roundsFor,
      roundsAgainst: row.roundsAgainst,
      diff: row.roundsFor - row.roundsAgainst,
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.matchesWon - a.matchesWon ||
        b.diff - a.diff ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** Tournaments that have not finished, soonest first. */
export async function upcomingTournaments(
  visible: number[] | null = [],
  limit = 12,
): Promise<ScheduledTournament[]> {
  const tournaments = await prisma.tournament.findMany({
    where: {
      State: { notIn: ["finished", "cancelled"] },
      ...(visible === null ? {} : { OR: [{ Published: true }, { Id: { in: visible } }] }),
    },
    // Nulls last: a tournament with no date is real but is not "next", and
    // MySQL sorts NULL first on ascending, which would put every undated one
    // at the top of a list titled "soonest".
    orderBy: [{ StartsAt: "asc" }, { Id: "asc" }],
    take: limit,
    include: { _count: { select: { Teams: true } } },
  });

  const rows = tournaments.map((tournament) => ({
    id: tournament.Id,
    slug: tournament.Slug,
    name: tournament.Name,
    hasBanner: tournament.BannerImage !== null,
    startsAt: tournament.StartsAt?.toISOString() ?? null,
    teamCount: tournament._count.Teams,
    maxTeams: tournament.MaxTeams,
    teamSize: tournament.TeamSize,
    state: tournament.State,
  }));

  return [
    ...rows.filter((r) => r.startsAt !== null),
    ...rows.filter((r) => r.startsAt === null),
  ];
}
