import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/serverI18n";
import Bracket from "@/components/tournament/Bracket";
import { standings } from "@/lib/tournament/bracket";

export const revalidate = 15;

export default async function TournamentPage({ params }: { params: { slug: string } }) {
  const t = getT();

  const tournament = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    include: {
      Stages: { orderBy: { Ordinal: "asc" } },
      Teams: { orderBy: [{ Seed: "asc" }, { Name: "asc" }], include: { Members: true } },
      Maps: { orderBy: { Ordinal: "asc" } },
    },
  });

  if (!tournament) notFound();

  const matches = await prisma.tournamentMatch.findMany({
    where: { TournamentId: tournament.Id },
    orderBy: [{ Round: "asc" }, { Slot: "asc" }],
  });

  const teamName = new Map(tournament.Teams.map((team) => [team.Id, team.Name]));

  const asBracket = (stageId: number) =>
    matches
      .filter((m) => m.StageId === stageId)
      .map((m) => ({
        id: m.Id,
        round: m.Round,
        slot: m.Slot,
        bestOf: m.BestOf,
        state: m.State,
        teamA: m.TeamAId ? { id: m.TeamAId, name: teamName.get(m.TeamAId) ?? "?" } : null,
        teamB: m.TeamBId ? { id: m.TeamBId, name: teamName.get(m.TeamBId) ?? "?" } : null,
        scoreA: m.ScoreA,
        scoreB: m.ScoreB,
        winnerTeamId: m.WinnerTeamId,
      }));

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">{tournament.State}</p>
          <h1 className="grad">{tournament.Name}</h1>
          {tournament.Description && <p className="muted">{tournament.Description}</p>}
        </div>
      </section>

      {tournament.Stages.map((stage) => {
        const stageMatches = asBracket(stage.Id);
        if (stageMatches.length === 0) return null;

        // A group is a table of standings; a bracket is a bracket. Showing a
        // group as a bracket is technically possible and tells you nothing about
        // who is going through, which is the only question a group asks.
        if (stage.Kind === "group" || stage.Kind === "swiss") {
          const teamIds = Array.from(
            new Set(stageMatches.flatMap((m) => [m.teamA?.id, m.teamB?.id]).filter(Boolean) as number[]),
          );

          const table = standings(
            teamIds,
            stageMatches.map((m) => ({
              teamAId: m.teamA?.id ?? null,
              teamBId: m.teamB?.id ?? null,
              scoreA: m.scoreA,
              scoreB: m.scoreB,
              finished: m.winnerTeamId !== null,
            })),
          );

          return (
            <section className="panel" key={stage.Id}>
              <h2>{stage.Name}</h2>
              <table>
                <thead>
                  <tr>
                    <th>{t("tournaments.team")}</th>
                    <th>{t("tournaments.played")}</th>
                    <th>{t("tournaments.won")}</th>
                    <th>{t("tournaments.diff")}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row) => (
                    <tr key={row.teamId}>
                      <td>{teamName.get(row.teamId) ?? "?"}</td>
                      <td>{row.played}</td>
                      <td>{row.won}</td>
                      <td className={row.diff > 0 ? "positive" : row.diff < 0 ? "negative" : ""}>
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        }

        return (
          <section className="panel" key={stage.Id}>
            <h2>{stage.Name}</h2>
            <Bracket matches={stageMatches} />
          </section>
        );
      })}

      <section className="panel">
        <h2>{t("tournaments.teams")}</h2>
        {tournament.Teams.length === 0 ? (
          <p className="muted">{t("tournaments.noTeams")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("tournaments.seed")}</th>
                <th>{t("tournaments.team")}</th>
                <th>{t("tournaments.players")}</th>
                <th>{t("tournaments.state")}</th>
              </tr>
            </thead>
            <tbody>
              {tournament.Teams.map((team) => (
                <tr key={team.Id}>
                  <td className="muted">{team.Seed ?? "—"}</td>
                  <td>
                    {team.Tag && <span className="chip" style={{ marginRight: 8 }}>{team.Tag}</span>}
                    {team.Name}
                  </td>
                  <td>{team.Members.filter((m) => m.Status === "accepted").length}</td>
                  <td>
                    <span className="chip">{team.Status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {tournament.Maps.length > 0 && (
        <section className="panel">
          <h2>{t("tournaments.pool")}</h2>
          <p className="muted">{tournament.Maps.map((m) => m.Map).join(" · ")}</p>
        </section>
      )}
    </>
  );
}
