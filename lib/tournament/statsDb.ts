import { prisma } from "@/lib/db";
import { aggregate, type PlayerTotals, type StatRow, type TournamentAppearance } from "@/lib/tournament/stats";

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

  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: Array.from(new Set(rows.map((r) => r.SteamId))) } },
    select: { SteamId: true, LastKnownName: true },
  });
  const names = Object.fromEntries(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName ?? ""]));

  return aggregate(
    rows.map((r) => {
      const row = asRow(r);
      return { ...row, teamId: row.teamId ?? teamOf.get(row.steamId) ?? null };
    }),
    names,
  );
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
