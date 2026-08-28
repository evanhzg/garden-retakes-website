import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import MatchAdmin from "@/components/tournament/MatchAdmin";
import Settings, { type LibraryMap, type SettingsView } from "@/components/tournament/Settings";
import Roster, { type RosterTeam } from "@/components/tournament/Roster";
import ServerConsoles from "@/components/tournament/ServerConsoles";
import Collapsible from "@/components/tournament/Collapsible";
import StatusTag from "@/components/tournament/StatusTag";
import { previewsForTournament } from "@/lib/tournament/preview";

export const dynamic = "force-dynamic";

export default async function TournamentAdminPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { key?: string };
}) {
  const t = getT();
  const ctx = await getTournamentContext(searchParams.key);

  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  // Checked against THIS tournament rather than against a level: an organizer
  // runs their own events and nobody else's, an admin runs all of them.
  if (!(await canManage(ctx, id))) {
    return (
      <section className="panel">
        <div className="empty-hint">
          <p style={{ margin: 0 }}>{t("setup.notYours")}</p>
        </div>
      </section>
    );
  }

  const tournament = await prisma.tournament.findUnique({
    where: { Id: id },
    include: {
      Stages: { orderBy: { Ordinal: "asc" } },
      Teams: {
        orderBy: [{ Seed: "asc" }, { Name: "asc" }],
        include: { Members: { orderBy: { Id: "asc" } } },
      },
      Maps: { orderBy: { Ordinal: "asc" } },
      _count: { select: { Teams: true } },
    },
  });

  if (!tournament) notFound();

  const [matches, previews, library] = await Promise.all([
    prisma.tournamentMatch.findMany({
      where: { TournamentId: id },
      orderBy: [{ Round: "asc" }, { Slot: "asc" }],
    }),
    previewsForTournament(id),
    prisma.gardenMap.findMany({
      where: { TournamentReady: true },
      orderBy: { MapName: "asc" },
      select: { MapName: true, DisplayName: true },
    }),
  ]);

  // Player names for the roster panel. One query for every member.
  const memberIds = tournament.Teams.flatMap((team) => team.Members.map((m) => m.SteamId));
  const profiles = memberIds.length
    ? await prisma.playerProfile.findMany({
        where: { SteamId: { in: memberIds } },
        select: { SteamId: true, LastKnownName: true },
      })
    : [];
  const nameOf = new Map(profiles.map((p) => [p.SteamId.toString(), p.LastKnownName ?? ""]));

  const teamName = new Map(tournament.Teams.map((x) => [x.Id, x.Name]));

  // Anything not finished is something somebody may need to act on; a finished
  // match is history and should not compete for attention.
  const actionable = matches.filter((m) => m.State !== "finished");

  const proto = headers().get("x-forwarded-proto") ?? "https";
  const host = headers().get("host") ?? "retakes.fr";
  const origin = `${proto}://${host}`;

  const view: SettingsView = {
    id: tournament.Id,
    slug: tournament.Slug,
    name: tournament.Name,
    description: tournament.Description ?? "",
    state: tournament.State,
    published: tournament.Published,
    visibility: tournament.Visibility === "invite" ? "invite" : "public",
    inviteToken: tournament.InviteToken,
    maxTeams: tournament.MaxTeams,
    teamSize: tournament.TeamSize,
    teamCount: tournament._count.Teams,
    format: tournament.Format,
    seeding: tournament.Seeding,
    bestOf: tournament.BestOf,
    finalBestOf: tournament.FinalBestOf,
    startsAt: tournament.StartsAt?.toISOString() ?? null,
    startedAt: tournament.StartedAt?.toISOString() ?? null,
    maps: tournament.Maps.map((m) => m.Map),
    rulesText: tournament.RulesText ?? "",
    prizeText: tournament.PrizeText ?? "",
    sponsorsText: tournament.SponsorsText ?? "",
    // Whether one exists, not the bytes: a MEDIUMBLOB has no business being
    // serialised into the page payload for a checkbox's worth of information.
    hasBanner: tournament.BannerImage !== null,
    isTest: tournament.IsTest,
    roleMode: tournament.RoleMode,
    discordUrl: tournament.DiscordUrl ?? "",
    teamSpeakUrl: tournament.TeamSpeakUrl ?? "",
    twitchChannels: tournament.TwitchChannels ?? "",
  };

  const teams: RosterTeam[] = tournament.Teams.map((team) => ({
    id: team.Id,
    name: team.Name,
    tag: team.Tag,
    status: team.Status,
    seed: team.Seed,
    inviteToken: team.InviteToken,
    captainSteamId: team.CaptainSteamId.toString(),
    members: team.Members.map((m) => ({
      steamId: m.SteamId.toString(),
      profileName: nameOf.get(m.SteamId.toString()) || m.SteamId.toString(),
      displayName: m.DisplayName,
      captain: m.IsCaptain,
      status: m.Status,
      roleT: m.RoleT,
      roleCt: m.RoleCt,
    })),
  }));

  const libraryMaps: LibraryMap[] = library.map((m) => ({
    name: m.MapName,
    label: m.DisplayName || m.MapName,
  }));

  return (
    <>
      <section className="panel">
        <div className="admin-head">
          <h2>{tournament.Name}</h2>
          <span className="role-badge">{ctx.roleName}</span>
        </div>

        <p className="muted">
          <Link href={`/tournaments/${tournament.Slug}`}>{t("tournamentAdmin.publicPage")}</Link>
          {" · "}
          <Link href={`/tournaments/${tournament.Slug}/live`}>{t("tournamentAdmin.liveWall")}</Link>
          {" · "}
          <Link href={`/tournaments/${tournament.Slug}/register`}>{t("setup.registerLink")}</Link>
        </p>
      </section>

      <section className="panel">
        <h3>{t("settings.title")}</h3>
        {/* Keyed by tournament id, and it has to be.
            Settings and Roster both seed every piece of their state from props
            in useState initialisers, which run only on mount. Without a key
            React reconciles rather than remounts when you navigate from
            /admin/tournaments/1 to /2 — same component, same position in the
            tree — so those initialisers never re-run. The previous
            tournament's name, map pool and rules stay in the boxes while the
            save handler posts to the NEW tournament's id, which quietly writes
            one tournament's settings onto another. */}
        <Settings key={tournament.Id} tournament={view} library={libraryMaps} adminKey={searchParams.key} origin={origin} />
      </section>

      <section className="panel">
        <h3>
          {t("tournaments.teams")} <span className="muted">({teams.length})</span>
        </h3>
        <Roster key={tournament.Id} teams={teams} adminKey={searchParams.key} origin={origin} slug={tournament.Slug} />
      </section>

      {/* A console for every server, picked by name.
          Here rather than only on a match, because the servers that need
          driving most are the ones NOT running a match: the one that will not
          load a map, the one that came back from a restart wrong. Those have no
          match page to open. */}
      <section className="panel">
        <h3>{t("consoles.title")}</h3>
        <p className="muted ts-hint">{t("consoles.blurb")}</p>
        <ServerConsoles adminKey={searchParams.key} />
      </section>

      {actionable.length > 0 && (
        <section className="panel">
          <h3>{t("tournamentAdmin.matches")}</h3>

          {/* Folded and two across, same as the rosters. An eight-team bracket
              has seven of these and each one carries its own control panel. */}
          <div className="ta-grid">
            {actionable.map((match) => (
              <Collapsible
                key={match.Id}
                tone={match.State === "live" ? "accent" : undefined}
                title={`${match.TeamAId ? teamName.get(match.TeamAId) ?? "?" : "—"} v ${
                  match.TeamBId ? teamName.get(match.TeamBId) ?? "?" : "—"
                }`}
                meta={<StatusTag kind="match" value={match.State} />}
              >
              <MatchAdmin
                matchId={match.Id}
                matchKey={match.MatchKey}
                teamA={match.TeamAId ? teamName.get(match.TeamAId) ?? "?" : "—"}
                teamB={match.TeamBId ? teamName.get(match.TeamBId) ?? "?" : "—"}
                state={match.State}
                adminKey={searchParams.key}
                preview={previews.get(match.Id) ?? null}
              />
              </Collapsible>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
