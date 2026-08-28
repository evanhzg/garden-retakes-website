import Link from "next/link";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import { getTournamentContext, manageableTournamentIds } from "@/lib/tournamentAuth";
import { AdminLevel } from "@/lib/adminAuth";
import {
  countdown,
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
  const mine = await manageableTournamentIds(ctx);
  const canSeeDrafts = mine === null ? true : mine.length > 0;

  const tournaments = await prisma.tournament.findMany({
    where: canSeeDrafts
      ? mine === null
        ? undefined
        : { OR: [{ State: { not: "draft" } }, { Id: { in: mine } }] }
      : { State: { not: "draft" } },
    orderBy: [{ StartsAt: "desc" }, { Id: "desc" }],
    include: { _count: { select: { Teams: true } } },
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

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{t("tournaments.eyebrow")}</p>
          <h1 className="grad">{t("tournaments.title")}</h1>
          <p className="muted">{t("tournaments.blurb")}</p>
        </div>
      </section>

      {/* What the mode is, before the bracket.
          A visitor who has found this page has been told "Blitz" by the nav and
          by the hero and has no idea what it means — and the name is the one
          piece of the system that cannot explain itself. It sits above the
          organizer tools because it is for the people who are NOT organizers,
          which is almost everybody who arrives here. */}
      <section className="panel blitz">
        <div className="blitz-col">
          <h2>{t("tournaments.whatIs")}</h2>
          <p className="muted">{t("tournaments.whatIsBody")}</p>
        </div>
        <div className="blitz-col">
          <h2>{t("tournaments.whyBlitz")}</h2>
          <p className="muted">{t("tournaments.whyBlitzBody")}</p>
        </div>
      </section>

      {/* The way in. These pages existed and were reachable only by knowing the
          URL, which meant an organizer could be given the role and still have no
          way to use it. */}
      {ctx.canCreate && (
        <section className="panel">
          <div className="admin-head">
            <h2>{t("tournaments.organizerTools")}</h2>
            <span className="role-badge">{ctx.roleName}</span>
          </div>

          <p className="muted" style={{ marginTop: -4 }}>
            {t("tournaments.organizerBlurb")}
          </p>

          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
            <Link className="btn btn-primary" href="/admin/tournaments">
              {t("tournaments.createOne")}
            </Link>

            {/* Admin and above only, and the button is hidden rather than shown
                and refused. Spawns are global per-map data shared by every
                tournament, so authoring them is a wider grant than running your
                own event — an organizer editing them would change everybody's. */}
            {ctx.level >= AdminLevel.Admin && (
              <>
                <Link className="btn btn-secondary" href="/admin/maker">
                  {t("setup.makerLink")}
                </Link>
                <Link className="btn btn-secondary" href="/admin?tab=maps">
                  {t("tournaments.mapLibrary")}
                </Link>
              </>
            )}
          </div>
        </section>
      )}

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
          <ul className="tl-list">
            {tournaments.map((tournament) => {
              const edition: EditionState = {
                published: tournament.Published,
                state: tournament.State,
                visibility: tournament.Visibility === "invite" ? "invite" : "public",
                maxTeams: tournament.MaxTeams,
                teamCount: tournament._count.Teams,
                startsAt: tournament.StartsAt,
                startedAt: tournament.StartedAt,
              };

              // Registration is offered only where it would actually be
              // accepted — the same predicate the register page and the API
              // use, so the button cannot promise what the server refuses.
              const openToJoin = registrationBlockedReason(edition, false) === null;
              const when = countdown(edition, now);

              return (
                <li key={tournament.Id} className={`tl-card ${tournament.BannerImage ? "has-banner" : ""}`}>
                  {/* The banner is a background behind the title, not a
                      thumbnail beside it — a tournament card should look like a
                      poster. Without one the card falls back to a tinted panel
                      rather than a broken image well, so a bannerless event
                      reads as plain rather than as unfinished. */}
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
                      <StatusTag kind="tournament" value={tournament.State} />
                      <span className="tl-fact">
                        {tournament.TeamSize}v{tournament.TeamSize}
                      </span>
                      <span className="tl-fact">
                        {tournament._count.Teams} / {tournament.MaxTeams}{" "}
                        {t("tournaments.teams").toLowerCase()}
                      </span>
                      {when.kind === "live" && <span className="tl-live">{t("countdown.live")}</span>}
                      {when.kind === "starting-soon" && (
                        <span className="tl-fact">{t("countdown.soon")}</span>
                      )}
                      {when.kind === "scheduled" && (
                        <time className="tl-fact" dateTime={when.startsAt.toISOString()}>
                          {when.startsAt.toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </time>
                      )}
                    </div>
                  </div>

                  <div className="tl-actions">
                    {openToJoin && (
                      <Link
                        className="btn btn-primary tl-btn"
                        href={`/tournaments/${tournament.Slug}/register`}
                      >
                        {t("tournaments.register")}
                      </Link>
                    )}
                    <Link className="btn btn-secondary tl-btn" href={`/tournaments/${tournament.Slug}`}>
                      {t("tournaments.view")}
                    </Link>
                    {manageable.has(tournament.Id) && (
                      <Link
                        className="btn btn-secondary tl-btn"
                        href={`/admin/tournaments/${tournament.Id}`}
                      >
                        {t("tournaments.manage")}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </HubTabs>
      </section>
    </>
  );
}
