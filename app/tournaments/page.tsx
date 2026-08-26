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

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{t("tournaments.eyebrow")}</p>
          <h1 className="grad">{t("tournaments.title")}</h1>
          <p className="muted">{t("tournaments.blurb")}</p>
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
                <li key={tournament.Id} className="tl-card">
                  <div className="tl-main">
                    <Link className="tl-name" href={`/tournaments/${tournament.Slug}`}>
                      {tournament.Name}
                    </Link>

                    <div className="tl-facts">
                      <span className="chip">{tournament.State}</span>
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
      </section>
    </>
  );
}
