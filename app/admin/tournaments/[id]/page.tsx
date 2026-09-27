import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import MatchAdmin from "@/components/tournament/MatchAdmin";
import Settings, { type LibraryMap, type SettingsView } from "@/components/tournament/Settings";
import Roster, { type RosterTeam } from "@/components/tournament/Roster";
import Exceptions from "@/components/tournament/Exceptions";
import ServerConsoles from "@/components/tournament/ServerConsoles";
import Collapsible from "@/components/tournament/Collapsible";
import StatusTag from "@/components/tournament/StatusTag";
import { previewsForTournament } from "@/lib/tournament/preview";
import { ArrowLeft, ExternalLink, Eye, MonitorPlay, UserPlus } from "lucide-react";
import "@/components/tournament/event-admin.css";

export const dynamic = "force-dynamic";

const IN_PLAY = ["veto", "roles", "ready", "live"];
const PANEL_URL = (process.env.PANEL_URL || "https://panel.retakes.fr").replace(/\/$/, "");

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
  const inPlay = matches.filter((m) => IN_PLAY.includes(m.State)).length;
  const toPlay = matches.filter((m) => m.State === "pending").length;
  const played = matches.filter((m) => m.State === "finished" || m.State === "forfeit").length;

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
      {/* The event at a glance, and the way around a long page.
          It was a title and three text links, and then the settings form —
          so on the night, the matches you were there to run sat below a
          screen of form fields and the consoles for every server on the box. */}
      <section className="panel ev-head">
        <div className="ev-title-row">
          <Link href={`/admin/blitz${searchParams.key ? `?key=${encodeURIComponent(searchParams.key)}` : ""}`} className="ev-back">
            <ArrowLeft size={14} /> {t("eventAdmin.back")}
          </Link>
          <h2 className="ev-title">{tournament.Name}</h2>
          <StatusTag kind="tournament" value={tournament.State} />
          {!tournament.Published && <span className="ev-hidden">{t("eventAdmin.hidden")}</span>}
          <span className="role-badge ev-role">{ctx.roleName}</span>
        </div>

        <div className="ev-actions">
          <Link className="btn btn-secondary" href={`/tournaments/${tournament.Slug}`}>
            <Eye size={15} /> {t("tournamentAdmin.publicPage")}
          </Link>
          <Link className="btn btn-secondary" href={`/tournaments/${tournament.Slug}/live`}>
            <MonitorPlay size={15} /> {t("tournamentAdmin.liveWall")}
          </Link>
          <Link className="btn btn-secondary" href={`/tournaments/${tournament.Slug}/register`}>
            <UserPlus size={15} /> {t("setup.registerLink")}
          </Link>
        </div>

        <dl className="ev-strip">
          <div>
            <dt>{t("eventAdmin.teams")}</dt>
            <dd className="num">
              {tournament._count.Teams}
              {tournament.MaxTeams < 999 && <span>/{tournament.MaxTeams}</span>}
            </dd>
          </div>
          <div>
            <dt>{t("eventAdmin.inPlay")}</dt>
            <dd className={`num ${inPlay ? "hot" : ""}`}>{inPlay}</dd>
          </div>
          <div>
            <dt>{t("eventAdmin.toPlay")}</dt>
            <dd className="num">{toPlay}</dd>
          </div>
          <div>
            <dt>{t("eventAdmin.played")}</dt>
            <dd className="num">{played}</dd>
          </div>
        </dl>

        <nav className="ev-jump" aria-label={t("eventAdmin.sections")}>
          {actionable.length > 0 && <a href="#ev-matches">{t("tournamentAdmin.matches")}</a>}
          <a href="#ev-teams">{t("tournaments.teams")}</a>
          <a href="#ev-issues">{t("eventAdmin.issues")}</a>
          <a href="#ev-settings">{t("settings.title")}</a>
          <a href="#ev-servers">{t("consoles.title")}</a>
        </nav>
      </section>

      {actionable.length > 0 && (
        <section className="panel ev-anchor" id="ev-matches">
          <h3>{t("tournamentAdmin.matches")}</h3>
          <div className="ta-grid">
            {actionable.map((match) => (
              <Collapsible
                key={match.Id}
                tone={match.State === "live" ? "accent" : undefined}
                // The one being played is the one you came for.
                defaultOpen={IN_PLAY.includes(match.State) && inPlay <= 2}
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

      <section className="panel ev-anchor" id="ev-teams">
        <h3>
          {t("tournaments.teams")} <span className="muted">({teams.length})</span>
        </h3>
        <Roster key={tournament.Id} teams={teams} adminKey={searchParams.key} origin={origin} slug={tournament.Slug} />
      </section>

      {/* For the day it does not go to plan — a team that did not show, a
          result to correct. */}
      <section className="panel ev-anchor" id="ev-issues">
        <Exceptions
          teams={teams}
          matches={matches.map((m) => ({
            id: m.Id,
            label: `${m.TeamAId ? teamName.get(m.TeamAId) ?? "?" : "—"} v ${
              m.TeamBId ? teamName.get(m.TeamBId) ?? "?" : "—"
            }`,
            state: m.State,
          }))}
          adminKey={searchParams.key}
        />
      </section>

      <section className="panel ev-anchor" id="ev-settings">
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

      {/* A console for every server, picked by name — last and folded.
          Kept here because the servers that need a nudge are often the ones
          NOT running a match (the one that will not load a map), and those
          have no match page. But it is a tool for when something is wrong,
          not part of running the night, and the full thing — a live journal,
          RCON with completion, restarts, files — is the panel's job. */}
      <section className="panel ev-anchor" id="ev-servers">
        <Collapsible title={t("consoles.title")} meta={<span className="muted">{t("eventAdmin.consolesMeta")}</span>}>
          <p className="muted ts-hint">{t("consoles.blurb")}</p>
          <ServerConsoles adminKey={searchParams.key} />
          {ctx.level >= 2 && (
            <a className="btn btn-secondary ev-panel-link" href={`${PANEL_URL}/`} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> {t("eventAdmin.openPanel")}
            </a>
          )}
        </Collapsible>
      </section>
    </>
  );
}
