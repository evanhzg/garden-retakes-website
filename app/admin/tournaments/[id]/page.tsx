import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import MatchAdmin from "@/components/tournament/MatchAdmin";

export const dynamic = "force-dynamic";

export default async function TournamentAdminPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { key?: string };
}) {
  const t = getT();
  const ctx = await getAdminContext(searchParams.key);

  if (ctx.level < AdminLevel.Admin) {
    return (
      <section className="panel">
        <div className="empty-hint">
          <p style={{ margin: 0 }}>{t("maker.adminsOnly")}</p>
        </div>
      </section>
    );
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const tournament = await prisma.tournament.findUnique({
    where: { Id: id },
    include: {
      Stages: { orderBy: { Ordinal: "asc" } },
      Teams: { orderBy: { Name: "asc" } },
    },
  });

  if (!tournament) notFound();

  const matches = await prisma.tournamentMatch.findMany({
    where: { TournamentId: id },
    orderBy: [{ Round: "asc" }, { Slot: "asc" }],
  });

  const teamName = new Map(tournament.Teams.map((x) => [x.Id, x.Name]));

  // Anything not finished is something somebody may need to act on; a finished
  // match is history and does not need a panel competing for attention.
  const actionable = matches.filter((m) => m.State !== "finished");

  return (
    <>
      <section className="panel">
        <div className="admin-head">
          <h2>{tournament.Name}</h2>
          <span className="role-badge">{levelName(ctx.level)}</span>
        </div>

        <p className="muted">
          <Link href={`/tournaments/${tournament.Slug}`}>{t("tournamentAdmin.publicPage")}</Link>
          {" · "}
          <Link href={`/tournaments/${tournament.Slug}/live`}>{t("tournamentAdmin.liveWall")}</Link>
          {" · "}
          {tournament.Teams.length} {t("tournaments.teams").toLowerCase()}
          {" · "}
          <span className="chip">{tournament.State}</span>
        </p>

        {tournament.Stages.length === 0 && (
          <div className="empty-hint">
            <p style={{ margin: 0 }}>{t("tournamentAdmin.noStages")}</p>
          </div>
        )}
      </section>

      {actionable.length === 0 ? (
        <section className="panel">
          <p className="muted">{t("tournamentAdmin.noMatches")}</p>
        </section>
      ) : (
        <section className="panel">
          <h3>{t("tournamentAdmin.matches")}</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {actionable.map((match) => (
              <MatchAdmin
                key={match.Id}
                matchId={match.Id}
                matchKey={match.MatchKey}
                teamA={match.TeamAId ? teamName.get(match.TeamAId) ?? "?" : "—"}
                teamB={match.TeamBId ? teamName.get(match.TeamBId) ?? "?" : "—"}
                state={match.State}
                adminKey={searchParams.key}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
