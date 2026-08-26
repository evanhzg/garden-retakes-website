import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import TournamentView, { type PoolMap, type StageView, type TeamView } from "@/components/tournament/TournamentView";
import { standings } from "@/lib/tournament/bracket";
import { previewsForTournament, type MatchPreview } from "@/lib/tournament/preview";
import { tournamentStats } from "@/lib/tournament/statsDb";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import Countdown from "@/components/tournament/Countdown";
import Community from "@/components/tournament/Community";
import type { RulesFacts } from "@/components/tournament/Rules";
import { notFound as pageNotFound } from "next/navigation";

// force-dynamic, not revalidate: the Manage button depends on who is looking,
// and a shared cache would show one viewer their controls on somebody else visit.
export const dynamic = "force-dynamic";

// The page is now a data-loader and a heading. Everything below the hero is one
// tabbed component, because a tournament of any size does not fit in a scroll:
// see components/tournament/TournamentView.tsx.

const pretty = (map: string) =>
  map
    .replace(/^(de_|cs_|ar_)/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default async function TournamentPage({ params }: { params: { slug: string } }) {
  const t = getT();

  const tournament = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    include: {
      Stages: { orderBy: { Ordinal: "asc" } },
      Teams: { orderBy: [{ Seed: "asc" }, { Name: "asc" }], include: { Members: true } },
      Maps: { orderBy: { Ordinal: "asc" } },
      Organizers: true,
    },
  });

  if (!tournament) notFound();

  const ctx = await getTournamentContext();
  const canManageThis = await canManage(ctx, tournament.Id);

  // An unpublished tournament does not exist as far as anybody else is
  // concerned. Not "closed" — invisible: telling a stranger that an organizer
  // has a half-built event is leaking work in progress.
  if (!tournament.Published && !canManageThis) pageNotFound();

  const [matches, previewMap, stats] = await Promise.all([
    prisma.tournamentMatch.findMany({
      where: { TournamentId: tournament.Id },
      orderBy: [{ Round: "asc" }, { Slot: "asc" }],
    }),
    previewsForTournament(tournament.Id),
    tournamentStats(tournament.Id),
  ]);

  const teamName = new Map(tournament.Teams.map((team) => [team.Id, team.Name]));

  // Names for the rosters and the stats table. One query for both, since a
  // tournament's players are the same people in each.
  const rosterIds = tournament.Teams.flatMap((team) => team.Members.map((m) => m.SteamId));
  const profiles = rosterIds.length
    ? await prisma.playerProfile.findMany({
        where: { SteamId: { in: rosterIds } },
        select: { SteamId: true, LastKnownName: true },
      })
    : [];
  const nameOf = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName ?? ""]));

  // Map artwork for the pool tab.
  const poolNames = tournament.Maps.map((m) => m.Map);
  const library = poolNames.length
    ? await prisma.gardenMap.findMany({
        where: { MapName: { in: poolNames } },
        select: { MapName: true, ImageUrl: true, DisplayName: true },
      })
    : [];
  const art = new Map(library.map((m) => [m.MapName, m]));

  const pool: PoolMap[] = tournament.Maps.map((m) => ({
    map: m.Map,
    label: art.get(m.Map)?.DisplayName || pretty(m.Map),
    image: art.get(m.Map)?.ImageUrl ?? null,
  }));

  const stages: StageView[] = tournament.Stages.map((stage) => {
    const stageMatches = matches
      .filter((m) => m.StageId === stage.Id)
      .map((m) => ({
        id: m.Id,
        round: m.Round,
        slot: m.Slot,
        bestOf: m.BestOf,
        state: m.State,
        teamA: m.TeamAId ? { id: m.TeamAId, name: teamName.get(m.TeamAId) ?? "?" } : null,
        teamB: m.TeamBId ? { id: m.TeamBId, name: teamName.get(m.TeamBId) ?? "?" } : null,
        scoreA: m.ScoreA,
        scoreB: m.ScoreB,
        winnerTeamId: m.WinnerTeamId,
      }));

    const isTable = stage.Kind === "group" || stage.Kind === "swiss";

    return {
      id: stage.Id,
      name: stage.Name,
      kind: stage.Kind,
      matches: stageMatches,
      standings: isTable
        ? standings(
            Array.from(
              new Set(
                stageMatches.flatMap((m) => [m.teamA?.id, m.teamB?.id]).filter(Boolean) as number[],
              ),
            ),
            stageMatches.map((m) => ({
              teamAId: m.teamA?.id ?? null,
              teamBId: m.teamB?.id ?? null,
              scoreA: m.scoreA,
              scoreB: m.scoreB,
              finished: m.winnerTeamId !== null,
            })),
          ).map((row) => ({ ...row, name: teamName.get(row.teamId) ?? "?" }))
        : null,
    };
  }).filter((stage) => stage.matches.length > 0 || stage.standings !== null);

  const teams: TeamView[] = tournament.Teams.map((team) => ({
    id: team.Id,
    seed: team.Seed,
    name: team.Name,
    tag: team.Tag,
    status: team.Status,
    players: team.Members.filter((m) => m.Status === "accepted").map((m) => ({
      steamId: m.SteamId.toString(),
      name: nameOf.get(m.SteamId.toString()) || m.SteamId.toString(),
      captain: m.IsCaptain,
      roleT: m.RoleT,
      roleCt: m.RoleCt,
    })),
  }));

  const teamOfPlayer = new Map<string, string>();
  for (const team of tournament.Teams) {
    for (const member of team.Members) teamOfPlayer.set(member.SteamId.toString(), team.Name);
  }

  const previews: Record<number, MatchPreview> = Object.fromEntries(previewMap);

  // Generated from the tournament's own settings rather than written down. A
  // rules page that says BO3 when the tournament is BO1 is worse than none, and
  // that is what a hand-maintained one becomes.
  const rules: RulesFacts = {
    teamSize: tournament.TeamSize,
    maxTeams: tournament.MaxTeams,
    teamCount: tournament.Teams.length,
    format: tournament.Format,
    seeding: tournament.Seeding,
    bestOf: tournament.BestOf,
    finalBestOf: tournament.FinalBestOf,
    startsAt: tournament.StartsAt?.toISOString() ?? null,
    rulesText: tournament.RulesText ?? "",
    prizeText: tournament.PrizeText ?? "",
    sponsorsText: tournament.SponsorsText ?? "",
    pool,
  };

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{tournament.State}</p>
          <h1 className="grad">{tournament.Name}</h1>
          {tournament.Description && <p className="muted">{tournament.Description}</p>}

          <p className="muted" style={{ fontSize: 13 }}>
            {tournament.TeamSize}v{tournament.TeamSize}
            {" · "}
            {tournament.Teams.length} {t("tournaments.teams").toLowerCase()}
            {tournament.State === "registration" && (
              <>
                {" · "}
                <Link href={`/tournaments/${tournament.Slug}/register`}>{t("setup.registerLink")}</Link>
              </>
            )}
            {" · "}
            <Link href={`/tournaments/${tournament.Slug}/live`}>{t("tournamentAdmin.liveWall")}</Link>
          </p>

          <Countdown
            startsAt={tournament.StartsAt?.toISOString() ?? null}
            startedAt={tournament.StartedAt?.toISOString() ?? null}
            state={tournament.State}
            published={tournament.Published}
            maxTeams={tournament.MaxTeams}
            teamCount={tournament.Teams.length}
            visibility={tournament.Visibility}
          />

          {/* Only for somebody who actually runs this one. */}
          {canManageThis && (
            <p style={{ marginTop: 10 }}>
              <Link className="btn btn-secondary" href={`/admin/tournaments/${tournament.Id}`}>
                {t("tournaments.manage")}
              </Link>
            </p>
          )}
        </div>
      </section>

      <Community
        discordUrl={tournament.DiscordUrl}
        teamSpeakUrl={tournament.TeamSpeakUrl}
        twitchChannels={tournament.TwitchChannels}
      />

      <TournamentView
        stages={stages}
        teams={teams}
        stats={stats.map((row) => ({ ...row, teamName: teamOfPlayer.get(row.steamId) ?? null }))}
        pool={pool}
        previews={previews}
        rules={rules}
        slug={tournament.Slug}
      />
    </>
  );
}
