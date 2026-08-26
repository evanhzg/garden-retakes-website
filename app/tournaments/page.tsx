import Link from "next/link";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import { getTournamentContext, manageableTournamentIds } from "@/lib/tournamentAuth";
import { AdminLevel } from "@/lib/adminAuth";

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
          <table>
            <thead>
              <tr>
                <th>{t("tournaments.name")}</th>
                <th>{t("tournaments.format")}</th>
                <th>{t("tournaments.teams")}</th>
                <th>{t("tournaments.state")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tournament) => (
                <tr key={tournament.Id}>
                  <td>
                    <Link href={`/tournaments/${tournament.Slug}`}>{tournament.Name}</Link>
                  </td>
                  <td className="muted">{tournament.TeamSize}v{tournament.TeamSize}</td>
                  <td>{tournament._count.Teams}</td>
                  <td>
                    <span className="chip">{tournament.State}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {manageable.has(tournament.Id) && (
                      <Link className="btn btn-secondary su-small" href={`/admin/tournaments/${tournament.Id}`}>
                        {t("tournaments.manage")}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
