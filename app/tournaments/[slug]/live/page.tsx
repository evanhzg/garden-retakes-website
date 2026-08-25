import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import LiveWall from "@/components/tournament/LiveWall";

export const dynamic = "force-dynamic";

export default async function TournamentLivePage({ params }: { params: { slug: string } }) {
  const t = getT();

  const tournament = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    select: { Name: true, Slug: true },
  });

  if (!tournament) notFound();

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{t("live.eyebrow")}</p>
          <h1 className="grad">{tournament.Name}</h1>
        </div>
      </section>

      <section className="panel">
        <LiveWall slug={tournament.Slug} />
      </section>
    </>
  );
}
