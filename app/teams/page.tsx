import { getActiveSeason, prisma } from "@/lib/db";
import { getT } from '@/lib/serverI18n';

export const revalidate = 30;

export default async function TeamsPage() {
    const t = getT();

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
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">{t("auto.page.competitive_retakes")}</span>
          <h1>
            {t("auto.page.the")} <span className="grad">{t("auto.page.2v2_3v3")}</span> {t("auto.page.ladder")}
                                </h1>
          <p className="muted">{t("auto.page.team_elo_records_and_recent_ma")} {season?.Name ?? "the current season"}.</p>
        </div>
      </section>

      <section className="panel">
        <h2>{t("auto.page.teams")} {season?.Name ?? "no season"}</h2>
        {teams.length === 0 ? (
          <p className="muted">{t("auto.page.no_cr_matches_yet_get_a_2v2_or")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t("auto.page.team")}</th>
                <th>{t("auto.page.size")}</th>
                <th>{t("auto.page.elo")}</th>
                <th>{t("auto.page.peak")}</th>
                <th>{t("auto.page.w_d_l")}</th>
                <th>{t("auto.page.rounds")}</th>
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
        <h2>{t("auto.page.recent_matches")}</h2>
        {matches.length === 0 ? (
          <p className="muted">{t("auto.page.nothing_played_yet")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("auto.page.map")}</th>
                <th>{t("auto.page.match")}</th>
                <th>{t("auto.page.score")}</th>
                <th>{t("auto.page.result")}</th>
                <th>{t("auto.page.elo")}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                <tr key={match.Id.toString()}>
                  <td>{match.Map}</td>
                  <td>
                    {match.TeamAName} <span className="muted">{t("auto.page.vs")}</span> {match.TeamBName}
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
