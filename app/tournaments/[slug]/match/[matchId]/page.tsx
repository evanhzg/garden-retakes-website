import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/serverI18n";
import { canManage, getTournamentContext } from "@/lib/tournamentAuth";
import VetoBoard from "@/components/tournament/VetoBoard";

export const dynamic = "force-dynamic";

// One match, for the two captains and everybody watching.
//
// Reachable as soon as the tournament has started — before the veto, before a
// server exists — because "where do I go" is the question a player has the
// moment a bracket appears, and the answer should be a page that already
// exists rather than a Discord message.

export default async function MatchPage({
  params,
}: {
  params: { slug: string; matchId: string };
}) {
  const t = getT();
  const session = getSession();

  const matchId = Number(params.matchId);
  if (!Number.isInteger(matchId)) notFound();

  const match = await prisma.tournamentMatch.findUnique({
    where: { Id: matchId },
    include: {
      Tournament: true,
      Maps: { orderBy: { Ordinal: "asc" } },
      Veto: { orderBy: { Ordinal: "asc" } },
    },
  });

  if (!match || match.Tournament.Slug !== params.slug) notFound();

  const ctx = await getTournamentContext();
  const isOrganizer = await canManage(ctx, match.TournamentId);

  if (!match.Tournament.Published && !isOrganizer) notFound();

  const teams = await prisma.tournamentTeam.findMany({
    where: { Id: { in: [match.TeamAId, match.TeamBId].filter((x): x is number => x !== null) } },
  });

  const teamA = teams.find((x) => x.Id === match.TeamAId);
  const teamB = teams.find((x) => x.Id === match.TeamBId);

  // Which side this viewer captains, if either. Captains act; everybody else
  // watches, including organizers who are not playing.
  const mySlot: "A" | "B" | null = !session
    ? null
    : teamA?.CaptainSteamId.toString() === session.steamId
      ? "A"
      : teamB?.CaptainSteamId.toString() === session.steamId
        ? "B"
        : null;

  const started = match.Tournament.StartedAt !== null;

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">
            <Link href={`/tournaments/${params.slug}`}>{match.Tournament.Name}</Link>
          </p>
          <h1 className="grad">
            {teamA?.Name ?? "—"} <span className="muted">v</span> {teamB?.Name ?? "—"}
          </h1>
          <p className="muted">
            BO{match.BestOf}
            {" · "}
            <span className="chip">{match.State}</span>
            {match.ScoreA + match.ScoreB > 0 && (
              <>
                {" · "}
                {match.ScoreA} – {match.ScoreB}
              </>
            )}
          </p>
        </div>
      </section>

      <section className="panel">
        <h3>{t("match.veto")}</h3>

        {!started ? (
          // A match page before the tournament starts is a real state, not an
          // error: the bracket is drawn and people click through it early.
          <p className="muted">{t("match.notStarted")}</p>
        ) : !teamA || !teamB ? (
          <p className="muted">{t("match.waitingTeams")}</p>
        ) : (
          <VetoBoard
            matchId={match.Id}
            teamA={teamA.Name}
            teamB={teamB.Name}
            mySlot={mySlot}
            isOrganizer={isOrganizer}
          />
        )}
      </section>

      {match.Maps.length > 0 && (
        <section className="panel">
          <h3>{t("tournaments.maps")}</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t("tournaments.tabs.pool")}</th>
                <th>{t("match.startSide")}</th>
                <th>{t("tournaments.tabs.stats")}</th>
              </tr>
            </thead>
            <tbody>
              {match.Maps.map((m) => (
                <tr key={m.Id}>
                  <td className="muted">{m.Ordinal + 1}</td>
                  <td>{m.Map}</td>
                  <td className="muted">{m.StartSideTeamA ?? t("match.knife")}</td>
                  <td>
                    {m.ScoreA} – {m.ScoreB}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
