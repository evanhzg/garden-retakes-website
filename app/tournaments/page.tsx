import Link from "next/link";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";

export const revalidate = 30;

export default async function TournamentsPage() {
  const t = getT();

  const tournaments = await prisma.tournament.findMany({
    where: { State: { not: "draft" } },
    orderBy: [{ StartsAt: "desc" }, { Id: "desc" }],
    include: { _count: { select: { Teams: true } } },
    take: 30,
  });

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{t("tournaments.eyebrow")}</p>
          <h1 className="grad">{t("tournaments.title")}</h1>
          <p className="muted">{t("tournaments.blurb")}</p>
        </div>
      </section>

      <section className="panel">
        {tournaments.length === 0 ? (
          <div className="empty-hint">
            <p style={{ margin: 0 }}>{t("tournaments.none")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("tournaments.name")}</th>
                <th>{t("tournaments.format")}</th>
                <th>{t("tournaments.teams")}</th>
                <th>{t("tournaments.state")}</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
