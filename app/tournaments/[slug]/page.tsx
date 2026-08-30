import { getSession } from "@/lib/auth";
import { resolveName } from "@/lib/tournament/playerNames";
import Link from "next/link";
import "@/components/tournament/org.css";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import TournamentView, { type PoolMap, type StageView, type TeamView } from "@/components/tournament/TournamentView";
import { standings } from "@/lib/tournament/bracket";
import { podiumFrom } from "@/lib/tournament/hub";
import type { Podium } from "@/components/tournament/Results";
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

  // Which org runs it. Null for every tournament that predates orgs, which is
  // most of them — the byline simply is not drawn for those.
  const org = tournament?.OrgId
    ? await prisma.gardenOrg.findUnique({
        where: { Id: tournament.OrgId },
        select: { Slug: true, Name: true },
      })
    : null;

  if (!tournament) notFound();

  const ctx = await getTournamentContext();
  const canManageThis = await canManage(ctx, tournament.Id);

  // An unpublished tournament does not exist as far as anybody else is
  // concerned. Not "closed" — invisible: telling a stranger that an organizer
  // has a half-built event is leaking work in progress.
  // An unpublished tournament is unlisted, not secret.
  //
  // This used to 404 for everybody but an organizer, which meant the link an
  // organizer copied out of their own browser went nowhere for every person
  // they sent it to — a tournament is created unpublished, so that is every
  // link until somebody remembers to publish. Nothing links here that is not
  // published, and the hub filters on it, so being reachable by URL costs
  // nothing and being unreachable cost an evening.
  //
  // A draft nobody should see yet is what Visibility is for.
  void canManageThis;

  /**
   * Who may see the voice server.
   *
   * Organizers and admins always — they set it up and have to test it. Players
   * only once the tournament has actually started, and only if they are on a
   * roster: before then the address on a public page is an open invitation for
   * anyone who read the bracket to sit in the channels.
   */
  const session = getSession();
  const isRegisteredPlayer =
    session !== null &&
    tournament.Teams.some((team) =>
      team.Members.some(
        (m) => m.SteamId.toString() === session.steamId && m.Status === "accepted",
      ),
    );

  const showTeamSpeak =
    canManageThis || (tournament.StartedAt !== null && isRegisteredPlayer);

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
      // DisplayName first: it is the name the organizer set FOR this event,
      // and it was being ignored in favour of a profile lookup that falls
      // through to the raw id for anybody who has never played the ladder.
      name: resolveName(m.DisplayName, nameOf.get(m.SteamId.toString()), m.SteamId.toString()),
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

  // Read off the same function the hub's archive uses, so a tournament's own
  // results page and its card in the archive can never disagree about who won.
  const podium: Podium[] = podiumFrom(matches, tournament.Teams).map((entry) => ({
    ...entry,
    players:
      teams.find((team) => team.id === entry.teamId)?.players.map((p) => ({
        steamId: p.steamId,
        name: p.name,
      })) ?? [],
  }));

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

          {/* Who runs it, and a way to their other events. A tournament without
              an org says nothing here rather than "by nobody" — most of them
              predate orgs entirely. */}
          {org && (
            <p className="tournament-by">
              <Link href={`/orgs/${org.Slug}`}>{t("org.by", { org: org.Name })}</Link>
            </p>
          )}

          {tournament.Description && <p className="muted">{tournament.Description}</p>}

          <p className="muted" style={{ fontSize: 13 }}>
            {tournament.TeamSize}v{tournament.TeamSize}
            {" · "}
            {tournament.Teams.length} {t("tournaments.teams").toLowerCase()}
            {" · "}
            <Link href={`/tournaments/${tournament.Slug}/live`}>{t("tournamentAdmin.liveWall")}</Link>
          </p>

          {/* Joining is a button, and it is here rather than buried in a line of
              metadata as a text link between two dots.
              It also no longer waits for State === "registration". A tournament
              that has not started yet is one you can still enter, and the state
              a tournament sits in before an organizer touches it is not
              something a player should have to know about — the gate that
              matters is whether it has begun. */}
          {!tournament.StartedAt && (
            <p style={{ marginTop: "var(--space-3)" }}>
              <Link className="btn btn-primary" href={`/tournaments/${tournament.Slug}/register`}>
                {t("tournaments.joinCta")}
              </Link>
            </p>
          )}

          <Countdown
            startsAt={tournament.StartsAt?.toISOString() ?? null}
            startedAt={tournament.StartedAt?.toISOString() ?? null}
            state={tournament.State}
            published={tournament.Published}
            maxTeams={tournament.MaxTeams}
            teamCount={tournament.Teams.length}
            visibility={tournament.Visibility}
          />

          {/* Only for somebody who actually runs this one.
              Was a grey secondary button reading "Manage", which said nothing
              about what it opens and looked like the least important control on
              a page it is the most important control on. */}
          {canManageThis && (
            <Link className="t-manage" href={`/admin/tournaments/${tournament.Id}`}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
                <path
                  fill="currentColor"
                  d="M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Zm7.43-2.53a7.6 7.6 0 0 0 0-1.94l2-1.55a.5.5 0 0 0 .12-.62l-1.9-3.28a.5.5 0 0 0-.6-.22l-2.35.94a7.5 7.5 0 0 0-1.68-.97l-.36-2.5a.5.5 0 0 0-.49-.42h-3.8a.5.5 0 0 0-.49.42l-.36 2.5c-.6.24-1.16.57-1.68.97l-2.35-.94a.5.5 0 0 0-.6.22L2.99 8.86a.5.5 0 0 0 .12.62l2 1.55a7.6 7.6 0 0 0 0 1.94l-2 1.55a.5.5 0 0 0-.12.62l1.9 3.28a.5.5 0 0 0 .6.22l2.35-.94c.52.4 1.08.73 1.68.97l.36 2.5a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.5c.6-.24 1.16-.57 1.68-.97l2.35.94a.5.5 0 0 0 .6-.22l1.9-3.28a.5.5 0 0 0-.12-.62Z"
                />
              </svg>
              <span className="t-manage-text">
                <strong>{t("tournaments.manageTitle")}</strong>
                <small>{t("tournaments.manageHint")}</small>
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* showTeamSpeak is decided here, not in the component. A voice server
          address filtered in the browser has already been sent to the browser,
          so the only place the decision means anything is before the render. */}
      <Community
        discordUrl={tournament.DiscordUrl}
        teamSpeakUrl={showTeamSpeak ? tournament.TeamSpeakUrl : null}
        twitchChannels={tournament.TwitchChannels}
        showTeamSpeak={showTeamSpeak}
      />

      <TournamentView
        stages={stages}
        teams={teams}
        stats={stats.map((row) => ({ ...row, teamName: teamOfPlayer.get(row.steamId) ?? null }))}
        pool={pool}
        previews={previews}
        rules={rules}
        slug={tournament.Slug}
        name={tournament.Name}
        podium={podium}
      />
    </>
  );
}
