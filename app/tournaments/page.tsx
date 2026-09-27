import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, Map as MapIcon, MonitorPlay, Plus, Settings2, Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import { getT, serverLocale } from "@/lib/serverI18n";
import { canUseOrgs, getTournamentContext, manageableTournamentIds } from "@/lib/tournamentAuth";
import { AdminLevel } from "@/lib/adminAuth";
import {
  bracketDecided,
  countdown,
  displayedState,
  registrationBlockedReason,
  type EditionState,
} from "@/lib/tournament/edition";
import "@/components/tournament/list.css";
import HubTabs from "@/components/tournament/HubTabs";
import { tournamentArchive, teamRankings, upcomingTournaments } from "@/lib/tournament/hub";
import { allTournamentStats } from "@/lib/tournament/statsDb";
import type { Board } from "@/components/stats/LeaderboardTabs";
import StatusTag from "@/components/tournament/StatusTag";

// Dynamic rather than revalidated: what you can see here depends on who you
// are — an organizer sees their own drafts, everybody else does not — and a
// shared 30-second cache would serve one person's view to the next.
export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const t = getT();
  const ctx = await getTournamentContext();

  // Everything an organizer runs, including drafts, plus every public one.
  // Drafts are otherwise invisible to the person who just created one, which
  // reads as "the create button did nothing".
  // showOrgs is asked here and not derived from canCreate: the two are
  // different standings, and an org's organizer who is not in the global
  // registry holds one without the other.
  const [mine, showOrgs] = await Promise.all([
    manageableTournamentIds(ctx),
    canUseOrgs(ctx),
  ]);
  const canSeeDrafts = mine === null ? true : mine.length > 0;

  const tournaments = await prisma.tournament.findMany({
    where: canSeeDrafts
      ? mine === null
        ? undefined
        : { OR: [{ State: { not: "draft" } }, { Id: { in: mine } }] }
      : { State: { not: "draft" } },
    orderBy: [{ StartsAt: "desc" }, { Id: "desc" }],
    include: {
      _count: { select: { Teams: true } },
      // EVERY match, not only the finished ones, and two columns of each.
      // Whether a tournament is over is answered by the round depth of the
      // bracket — see decidingMatch — so the unplayed rows are what say which
      // match is the final. Two small integers across thirty tournaments is a
      // cheaper way to be right than a State column nothing maintains.
      Matches: { select: { Round: true, WinnerTeamId: true } },
    },
    take: 30,
  });

  const manageable = new Set(mine ?? tournaments.map((x) => x.Id));

  // One clock for the whole list, so every card on a page agrees about "now".
  const now = new Date();

  // The hub panels. Fetched in parallel with each other because none of them
  // depends on another, and all four are read off rows that already exist.
  const [archive, teamRanks, players, schedule] = await Promise.all([
    // `mine` is null for admins (everything) and a list of ids for an
    // organizer, which is exactly what these want: an organizer's own
    // unpublished event stays visible to them and to nobody else.
    tournamentArchive(mine),
    teamRankings(mine),
    // Reuses the rounds-weighted aggregation written for demo-mode /stats
    // rather than averaging per-map ratings, which is a different and wrong
    // number.
    allTournamentStats(12),
    upcomingTournaments(mine),
  ]);

  const board = (
    title: string,
    unit: string,
    value: (p: (typeof players)[number]) => number,
    format: (v: number) => string,
  ): Board => ({
    title,
    unit,
    rows: [...players]
      .sort((a, b) => value(b) - value(a))
      .slice(0, 10)
      .map((p) => ({ steamId: p.steamId, name: p.name || p.steamId, value: format(value(p)) })),
  });

  const boards: Board[] = players.length === 0 ? [] : [
    board(t("tstats.rating"), "Rating", (p) => p.ratingAvg, (v) => v.toFixed(2)),
    board(t("tstats.adr"), "ADR", (p) => p.adr, (v) => v.toFixed(0)),
    board(t("tstats.kd"), "K/D", (p) => p.kd, (v) => v.toFixed(2)),
    board(t("tstats.kast"), "KAST %", (p) => p.kast, (v) => `${v.toFixed(0)}%`),
    board(t("tstats.hs"), "HS %", (p) => p.hs, (v) => `${v.toFixed(0)}%`),
    board(t("tstats.kills"), "Kills", (p) => p.kills, (v) => String(v)),
    board(t("tstats.entries"), "Entries", (p) => p.entryKills, (v) => String(v)),
    board(t("tstats.clutches"), "Clutches", (p) => p.clutches, (v) => String(v)),
  ];

  // Every card's derived facts, once — the grouping and the summary strip read
  // the same values the cards print, so the three can never disagree.
  const rows = tournaments.map((tournament) => {
    const edition: EditionState = {
      published: tournament.Published,
      state: tournament.State,
      visibility: tournament.Visibility === "invite" ? "invite" : "public",
      maxTeams: tournament.MaxTeams,
      teamCount: tournament._count.Teams,
      startsAt: tournament.StartsAt,
      startedAt: tournament.StartedAt,
    };
    // A tournament with a champion is over, whatever its row says — nothing
    // writes State back to "finished".
    const decided = bracketDecided(tournament.Matches.map((m) => ({ round: m.Round, winnerTeamId: m.WinnerTeamId })));
    return {
      tournament,
      // Registration is offered only where it would actually be accepted — the
      // same predicate the register page and the API use.
      openToJoin: registrationBlockedReason(edition, false) === null,
      when: countdown(edition, now),
      shown: displayedState(tournament.State, decided),
      played: tournament.Matches.filter((m) => m.WinnerTeamId !== null).length,
      total: tournament.Matches.length,
    };
  });

  const groups = [
    { id: "live", rows: rows.filter((r) => r.shown === "live") },
    { id: "open", rows: rows.filter((r) => r.shown === "registration") },
    { id: "upcoming", rows: rows.filter((r) => !["live", "registration", "finished", "cancelled"].includes(r.shown)) },
    { id: "finished", rows: rows.filter((r) => r.shown === "finished" || r.shown === "cancelled") },
  ];

  const publicRows = rows.filter((r) => r.shown !== "draft");
  const summary = [
    { key: "tlist.sum.live", value: groups[0].rows.length, hot: groups[0].rows.length > 0 },
    { key: "tlist.sum.open", value: groups[1].rows.length },
    { key: "tlist.sum.teams", value: publicRows.reduce((n, r) => n + r.tournament._count.Teams, 0) },
    { key: "tlist.sum.matches", value: publicRows.reduce((n, r) => n + r.played, 0) },
  ];
  const locale = serverLocale() === "fr" ? "fr-FR" : "en-GB";

  return (
    <>
      {/* Title and tools share the hero, side by side.
          The tools were a full-width panel of their own between the explainer
          and the list, which put the one section only a handful of people can
          use in the middle of the page everybody else came to read. Beside the
          title they are out of the way of the list and still the first thing an
          organizer's eye lands on. */}
      <section className="tl-hero">
        <div className="tl-hero-grid">
          <div className="tl-hero-copy">
            <span className="tl-kicker">{t("tournaments.kicker")}</span>

            {/* The homepage's two faces, quoted. The statement is in the
                grotesque and the NAME is in the serif italic, which is the one
                job that face has anywhere on the site — and this page is the
                front door to the thing the homepage is naming, so the two have
                to agree. The gradient is gone with it: .grad paints text with
                background-clip, which is a third treatment competing with the
                two that already say everything. */}
            <h1 className="tl-title">
              {t("tournaments.titleLead")}{" "}
              <em className="tl-title-serif">{t("tournaments.titleName")}</em>
            </h1>

            <p className="tl-blurb">{t("tournaments.blurb")}</p>
          </div>

          {/* The way in. These pages existed and were reachable only by knowing
              the URL, which meant an organizer could be given the role and still
              have no way to use it. */}
          {/* A toolbar, not a panel.
              It was a bordered box with its own heading, its own paragraph and
              four stacked buttons, taking a third of the page's first screen
              to say what four labels already say — and putting the section only
              a handful of people can use above the list everybody came for.
              One row, one filled button, the rest ghosts. */}
          {(ctx.canCreate || showOrgs) && (
            <aside className="tl-tools" aria-label={t("tournaments.organizerTools")}>
              <span className="tl-role">
                <Settings2 size={13} aria-hidden focusable="false" />
                {ctx.roleName}
              </span>

              <div className="tl-tools-list">
                {ctx.canCreate && (
                  <Link className="tl-tool is-primary" href="/admin/tournaments">
                    <Plus size={15} aria-hidden focusable="false" />
                    {t("tournaments.createOne")}
                  </Link>
                )}

                {/* Admin and above only, and the button is hidden rather than
                    shown and refused. Spawns are global per-map data shared by
                    every tournament, so authoring them is a wider grant than
                    running your own event — an organizer editing them would
                    change everybody's. */}
                {ctx.level >= AdminLevel.Admin && (
                  <>
                    <Link className="tl-tool" href="/admin/maker">
                      <Wrench size={15} aria-hidden focusable="false" />
                      {t("setup.makerLink")}
                    </Link>
                    <Link className="tl-tool" href="/admin?tab=maps">
                      <MapIcon size={15} aria-hidden focusable="false" />
                      {t("tournaments.mapLibrary")}
                    </Link>
                  </>
                )}

                {/* Wider than canCreate: somebody can hold the organizer role in
                    an org without being in the global organizer registry, and
                    their own org's page was reachable only by knowing its slug. */}
                {showOrgs && (
                  <Link className="tl-tool" href="/orgs">
                    <Building2 size={15} aria-hidden focusable="false" />
                    {t("tournaments.orgsLink")}
                  </Link>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* The circuit in four numbers, before the list. */}
        <dl className="tl-summary">
          {summary.map((s) => (
            <div key={s.key} className={s.hot ? "hot" : ""}>
              <dt>{t(s.key)}</dt>
              <dd className="num">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <HubTabs archive={archive} teams={teamRanks} boards={boards} schedule={schedule}>
        {tournaments.length === 0 ? (
          <div className="empty-hint">
            <p style={{ margin: 0 }}>{t("tournaments.none")}</p>
            {ctx.canCreate && (
              <Link className="btn btn-primary" style={{ marginTop: 12 }} href="/admin/tournaments">
                {t("tournaments.createOne")}
              </Link>
            )}
          </div>
        ) : (
          /* Cards, not a table.
             This was a five-column table with no scroll wrapper, so on a phone
             it pushed the whole page sideways — and this is the front door to
             the entire tournament flow, which most players reach from a Discord
             link on a phone. A card also has room for the two facts the table
             had nowhere to put: when it starts, and whether you can still
             enter. */
          /* Grouped by what you can do with each event, not one undifferentiated
             stack: what is being played now, what you can still enter, what is
             coming, what is over. The same cards, in four labelled runs. */
          <div className="tl-groups">
            {groups.map((group) =>
              group.rows.length === 0 ? null : (
                <section key={group.id} className={`tl-group tl-group-${group.id}`}>
                  <h2 className="tl-group-title">
                    {group.id === "live" && <span className="tl-live-dot" aria-hidden />}
                    {t(`tlist.group.${group.id}`)}
                    <span className="num">{group.rows.length}</span>
                  </h2>
                  <ul className="tl-list">
                    {group.rows.map(({ tournament, openToJoin, when, shown, played, total }) => (
                      <li
                        key={tournament.Id}
                        className={`tl-card st-${shown} ${tournament.BannerImage ? "has-banner" : ""}`}
                      >
                        {/* The banner is a background behind the title, not a
                            thumbnail beside it — a tournament card should look
                            like a poster. */}
                        <div className="tl-banner">
                          {tournament.BannerImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/tournaments/${tournament.Slug}/banner`} alt="" loading="lazy" />
                          )}
                          <span className="tl-scrim" aria-hidden />
                        </div>

                        <div className="tl-main">
                          <Link className="tl-name" href={`/tournaments/${tournament.Slug}`}>
                            {tournament.Name}
                          </Link>

                          <div className="tl-facts">
                            <StatusTag kind="tournament" className="compact" value={shown} />
                            <span className="tl-fact">
                              {tournament.TeamSize}v{tournament.TeamSize}
                            </span>
                            <span className="tl-fact">
                              {t(`tlist.format.${tournament.Format}`)} · BO{tournament.BestOf}
                            </span>
                            {/* A pickup lobby's cap is 9999, meaning "no limit";
                                below it, the count alone. */}
                            <span className="tl-fact">
                              {tournament.MaxTeams >= 999
                                ? tournament._count.Teams
                                : `${tournament._count.Teams} / ${tournament.MaxTeams}`}{" "}
                              {t("tournaments.teams").toLowerCase()}
                            </span>
                            {when.kind === "starting-soon" && <span className="tl-fact">{t("countdown.soon")}</span>}
                            {when.kind === "scheduled" && (
                              <time className="tl-fact" dateTime={when.startsAt.toISOString()}>
                                <CalendarDays size={12} aria-hidden />
                                {when.startsAt.toLocaleDateString(locale, {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                            )}
                          </div>

                          {/* How full an entry list is, or how far a bracket has
                              got — the one number that says whether to hurry. */}
                          {shown === "registration" && tournament.MaxTeams < 999 && (
                            <div className="tl-progress" aria-label={t("tlist.filled")}>
                              <span style={{ width: `${Math.min(100, (tournament._count.Teams / tournament.MaxTeams) * 100)}%` }} />
                            </div>
                          )}
                          {shown === "live" && total > 0 && (
                            <div className="tl-progress live" aria-label={t("tlist.progress", { n: played, total })}>
                              <span style={{ width: `${Math.min(100, (played / total) * 100)}%` }} />
                              <em className="num">{t("tlist.progress", { n: played, total })}</em>
                            </div>
                          )}
                        </div>

                        {/* One filled button — the thing this event is for right
                            now — and ghosts for the rest. */}
                        <div className="tl-actions">
                          {openToJoin && (
                            <Link className="tl-btn is-primary" href={`/tournaments/${tournament.Slug}/register`}>
                              {t("tournaments.register")}
                              <ArrowRight size={14} aria-hidden focusable="false" />
                            </Link>
                          )}
                          {shown === "live" && (
                            <Link className="tl-btn is-live" href={`/tournaments/${tournament.Slug}/live`}>
                              <MonitorPlay size={14} aria-hidden focusable="false" />
                              {t("tlist.watch")}
                            </Link>
                          )}
                          <Link className="tl-btn" href={`/tournaments/${tournament.Slug}`}>
                            {shown === "finished" ? t("tlist.results") : t("tournaments.view")}
                          </Link>
                          {manageable.has(tournament.Id) && (
                            <Link
                              className="tl-btn tl-btn-icon"
                              href={`/admin/tournaments/${tournament.Id}`}
                              title={t("tournaments.manage")}
                              aria-label={`${t("tournaments.manage")} — ${tournament.Name}`}
                            >
                              <Settings2 size={14} aria-hidden focusable="false" />
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
            )}
          </div>
        )}
        </HubTabs>
      </section>
    </>
  );
}
