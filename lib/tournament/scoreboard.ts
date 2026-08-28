import { prisma } from "@/lib/db";
import { aggregate, type PlayerTotals, type StatRow } from "@/lib/tournament/stats";
import { tournamentPlayerNames } from "@/lib/tournament/playerNames";
import { rolesForMatch } from "@/lib/tournament/roleDraft";

// One match's scoreboard: the map being played, the maps already played, and
// the series as a whole.
//
// Built once, on the server, and used by both the page's first paint and the
// endpoint the page polls. That is deliberate. A scoreboard that only exists
// client-side is a match page that renders empty for a link somebody shared,
// and a scoreboard computed twice in two places is two scoreboards that
// eventually disagree about a rating.
//
// The tab per map is not decoration. A BO3's stats are three different
// questions — how is this map going, how did the last one go, who has been the
// best player of the series — and rolling them into one table answers none of
// them. The series tab is a rounds-weighted aggregate rather than a mean of the
// map figures, because a player who rated 1.40 over 12 rounds and 0.60 over 30
// did not have a 1.00 series.

export type ScoreboardMap = {
  id: number;
  ordinal: number;
  map: string;
  label: string;
  scoreA: number;
  scoreB: number;
  state: string;
  isDecider: boolean;
  /** The side team A starts on, or null when a knife round decided it. */
  startSideTeamA: string | null;
  /** "a" | "b" | null. */
  winner: "a" | "b" | null;
  pickedBy: "a" | "b" | null;
};

export type ScoreboardRow = PlayerTotals & {
  /** "a" | "b", so the table can be split without the caller knowing team ids. */
  slot: "a" | "b" | null;
  roleT: string | null;
  roleCt: string | null;
  isBot: boolean;
};

export type ScoreboardTab = {
  /** "series", or the map row's id as a string. */
  key: string;
  label: string;
  /** Rounds on this tab. Null on the series tab, where the score is maps. */
  scoreA: number | null;
  scoreB: number | null;
  live: boolean;
};

export type Scoreboard = {
  matchId: number;
  state: string;
  bestOf: number;
  /** Maps won. */
  scoreA: number;
  scoreB: number;
  teamA: { id: number; name: string; tag: string | null } | null;
  teamB: { id: number; name: string; tag: string | null } | null;
  maps: ScoreboardMap[];
  tabs: ScoreboardTab[];
  /** Rows per tab key. Empty for a map nobody has reported stats on yet. */
  rows: Record<string, ScoreboardRow[]>;
  /** Which tab to open on. The live map, else the last played, else the series. */
  defaultTab: string;
};

const pretty = (map: string) =>
  map.replace(/^de_/, "").replace(/^(.)/, (c) => c.toUpperCase());

const asStatRow = (r: {
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

export async function scoreboardFor(matchId: number): Promise<Scoreboard | null> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: { Maps: { orderBy: { Ordinal: "asc" } } },
  });

  if (!match) return null;

  const teams = await prisma.tournamentTeam.findMany({
    where: { Id: { in: [match.TeamAId, match.TeamBId].filter((x): x is number => x !== null) } },
    include: { Members: { where: { Status: "accepted" } } },
  });

  const teamA = teams.find((x) => x.Id === match.TeamAId) ?? null;
  const teamB = teams.find((x) => x.Id === match.TeamBId) ?? null;

  const [stats, names, roles] = await Promise.all([
    prisma.tournamentPlayerStat.findMany({ where: { MatchId: matchId } }),
    tournamentPlayerNames(match.TournamentId),
    rolesForMatch(matchId),
  ]);

  // The plugin reports SteamIDs, not team ids, so a stat row's TeamId is often
  // null. The roster is the authority on who played for whom.
  const teamOf = new Map<string, number>();
  const botIds = new Set<string>();

  for (const team of teams) {
    for (const member of team.Members) {
      teamOf.set(member.SteamId.toString(), team.Id);
      if (member.IsBot) botIds.add(member.SteamId.toString());
    }
  }

  const slotOf = (teamId: number | null): "a" | "b" | null =>
    teamId === null ? null : teamId === match.TeamAId ? "a" : teamId === match.TeamBId ? "b" : null;

  const decorate = (totals: PlayerTotals[]): ScoreboardRow[] =>
    totals.map((row) => {
      const teamId = row.teamId ?? teamOf.get(row.steamId) ?? null;
      const role = roles.get(row.steamId);
      return {
        ...row,
        teamId,
        slot: slotOf(teamId),
        roleT: role?.roleT ?? null,
        roleCt: role?.roleCt ?? null,
        isBot: botIds.has(row.steamId),
      };
    });

  const rowsFor = (rows: typeof stats): ScoreboardRow[] =>
    decorate(
      aggregate(
        rows.map((r) => {
          const row = asStatRow(r);
          return { ...row, teamId: row.teamId ?? teamOf.get(row.steamId) ?? null };
        }),
        names,
      ),
    );

  const maps: ScoreboardMap[] = match.Maps.map((m) => ({
    id: m.Id,
    ordinal: m.Ordinal,
    map: m.Map,
    label: pretty(m.Map),
    scoreA: m.ScoreA,
    scoreB: m.ScoreB,
    state: m.State,
    isDecider: m.IsDecider,
    startSideTeamA: m.StartSideTeamA,
    winner:
      m.WinnerTeamId === null ? null : m.WinnerTeamId === match.TeamAId ? "a" : "b",
    pickedBy:
      m.PickedByTeamId === null ? null : m.PickedByTeamId === match.TeamAId ? "a" : "b",
  }));

  // A map with no stats and no score has not been reached yet. It still belongs
  // in the map list — the series is public information from the moment the veto
  // ends — but a tab for it would be an empty table with a promise attached.
  const reached = maps.filter(
    (m) => m.state !== "pending" || m.scoreA + m.scoreB > 0 || stats.some((s) => s.MapId === m.id),
  );

  const rows: Record<string, ScoreboardRow[]> = {};
  const tabs: ScoreboardTab[] = [];

  for (const m of reached) {
    rows[String(m.id)] = rowsFor(stats.filter((s) => s.MapId === m.id));
    tabs.push({
      key: String(m.id),
      label: m.label,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      live: m.state === "live",
    });
  }

  // The series tab exists as soon as there is more than one map's worth of it to
  // aggregate. On a BO1 it would be the same table twice.
  const multi = reached.length > 1;

  if (multi) {
    rows.series = rowsFor(stats);
    tabs.unshift({
      key: "series",
      label: "series",
      scoreA: match.ScoreA,
      scoreB: match.ScoreB,
      live: false,
    });
  }

  // A finished match opens on the series, because the question is "who won and
  // who played well"; a live one opens on the map being played, because the
  // question is "what is happening".
  const live = tabs.find((t) => t.live);
  const defaultTab =
    match.State === "finished" && multi
      ? "series"
      : live?.key ?? tabs[tabs.length - 1]?.key ?? "series";

  return {
    matchId,
    state: match.State,
    bestOf: match.BestOf,
    scoreA: match.ScoreA,
    scoreB: match.ScoreB,
    teamA: teamA && { id: teamA.Id, name: teamA.Name, tag: teamA.Tag },
    teamB: teamB && { id: teamB.Id, name: teamB.Name, tag: teamB.Tag },
    maps,
    tabs,
    rows,
    defaultTab,
  };
}
