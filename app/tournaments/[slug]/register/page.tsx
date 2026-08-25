import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import Register from "@/components/tournament/Register";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ params }: { params: { slug: string } }) {
  const t = getT();

  const tournament = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    include: { _count: { select: { Teams: true } } },
  });

  if (!tournament) notFound();

  const open = tournament.State === "registration";

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{tournament.Name}</p>
          <h1 className="grad">{t("register.title")}</h1>
          <p className="muted">
            {t("register.blurb", {
              size: String(tournament.TeamSize),
              teams: String(tournament._count.Teams),
              max: String(tournament.MaxTeams),
            })}
          </p>
        </div>
      </section>

      <section className="panel">
        <Register tournamentId={tournament.Id} teamSize={tournament.TeamSize} open={open} />
      </section>
    </>
  );
}
