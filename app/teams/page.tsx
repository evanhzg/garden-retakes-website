import { getActiveSeason, prisma } from "@/lib/db";

export const revalidate = 30;

export default async function TeamsPage() {
  const season = await getActiveSeason();

  const teams = season
    ? await prisma.crTeamStats.findMany({
        where: { SeasonId: season.Id, MatchesPlayed: { gt: 0 } },
        orderBy: { Elo: "desc" },
        take: 50,
      })
    : [];

  const matches = season
    ? await prisma.crMatch.findMany({
        where: { SeasonId: season.Id },
        orderBy: { Id: "desc" },
        take: 15,
      })
    : [];

  return (
    <>
      <section className="panel">
        <h2>Competitive Retakes teams — {season?.Name ?? "no season"}</h2>
        {teams.length === 0 ? (
          <p className="muted">No CR matches yet. Get a 2v2 or 3v3 going and type /cr!</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Size</th>
                <th>ELO</th>
                <th>Peak</th>
                <th>W-D-L</th>
                <th>Rounds</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, index) => (
                <tr key={team.Id}>
                  <td>{index + 1}</td>
                  <td>{team.PlayerNames}</td>
                  <td>{team.TeamSize}v{team.TeamSize}</td>
                  <td className="elo">{team.Elo}</td>
                  <td>{team.PeakElo}</td>
                  <td>
                    {team.MatchesWon}-{team.MatchesDrawn}-
                    {team.MatchesPlayed - team.MatchesWon - team.MatchesDrawn}
                  </td>
                  <td>
                    {team.RoundsWon}:{team.RoundsLost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Recent matches</h2>
        {matches.length === 0 ? (
          <p className="muted">Nothing played yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Map</th>
                <th>Match</th>
                <th>Score</th>
                <th>Result</th>
                <th>ELO</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                <tr key={match.Id.toString()}>
                  <td>{match.Map}</td>
                  <td>
                    {match.TeamAName} <span className="muted">vs</span> {match.TeamBName}
                  </td>
                  <td>
                    {match.ScoreA}-{match.ScoreB}
                  </td>
                  <td>
                    {match.Result === "A"
                      ? match.TeamAName
                      : match.Result === "B"
                        ? match.TeamBName
                        : match.Result}
                  </td>
                  <td>
                    {match.Result === "cancelled" ? (
                      <span className="muted">—</span>
                    ) : (
                      <>
                        <span className={match.EloDeltaA >= 0 ? "positive" : "negative"}>
                          {match.EloDeltaA >= 0 ? `+${match.EloDeltaA}` : match.EloDeltaA}
                        </span>
                        {" / "}
                        <span className={match.EloDeltaB >= 0 ? "positive" : "negative"}>
                          {match.EloDeltaB >= 0 ? `+${match.EloDeltaB}` : match.EloDeltaB}
                        </span>
                      </>
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
