import Link from "next/link";
import { getActiveSeason, prisma } from "@/lib/db";
import { getT } from '@/lib/serverI18n';
import { getSession } from "@/lib/auth";
import { teamsOf } from "@/lib/tournament/teamStore";
import CreateTeam from "@/components/tournament/CreateTeam";
import "@/components/tournament/teams.css";

// Two different things are called a team on this page, and they stay separate.
//
// The LADDER below is the Blitz duo/trio ELO table: a "team" there is whoever
// happened to queue together, identified by the names on the scoreboard. It is
// a record of results, not of people.
//
// STANDING TEAMS, added above it, are the other kind — a roster that exists
// between events, with a captain, a page and a history. They are what a
// tournament entry can now point at, so three entries by the same five people
// are one thread rather than three unrelated rows.
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
    const t = getT();
  const session = getSession();

  const season = await getActiveSeason();

  const [standing, mine] = await Promise.all([
    prisma.gardenTeam.findMany({
      orderBy: { CreatedAt: "desc" },
      take: 60,
      include: { _count: { select: { Members: true, Entries: true } } },
    }),
    session ? teamsOf(session.steamId) : Promise.resolve([]),
  ]);

  const mineIds = new Set(mine.map((m) => m.id));

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

      {/* Standing teams first: they are the thing somebody came here to find or
          to make. The ladder underneath is a record and keeps its place. */}
      <section className="panel">
        <div className="admin-head">
          <h2>{t("teams.standing")}</h2>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>{t("teams.blurb")}</p>

        {session && mine.length > 0 && (
          <>
            <div className="tm-sub">{t("teams.yours")}</div>
            <ul className="tm-list">
              {mine.map((m) => (
                <li key={m.id}>
                  <Link className="tm-row is-mine" href={`/teams/${m.slug}`}>
                    <span className="tm-name">
                      {m.tag && <span className="tm-tag">{m.tag}</span>}
                      {m.name}
                    </span>
                    <span className="tm-role">{t(`teams.role.${m.role}`)}</span>
                    <span className="tm-meta muted">
                      {t("teams.memberCount", { n: String(m.memberCount) })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {standing.filter((x) => !mineIds.has(x.Id)).length > 0 && (
          <>
            {session && mine.length > 0 && <div className="tm-sub">{t("teams.all")}</div>}
            <ul className="tm-list">
              {standing
                .filter((x) => !mineIds.has(x.Id))
                .map((team) => (
                  <li key={team.Id}>
                    <Link className="tm-row" href={`/teams/${team.Slug}`}>
                      <span className="tm-name">
                        {team.Tag && <span className="tm-tag">{team.Tag}</span>}
                        {team.Name}
                      </span>
                      <span className="tm-meta muted">
                        {t("teams.memberCount", { n: String(team._count.Members) })}
                        {team._count.Entries > 0 &&
                          ` · ${t("teams.entryCount", { n: String(team._count.Entries) })}`}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </>
        )}

        {standing.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>{t("teams.emptyAll")}</p>
        )}

        {session && <CreateTeam />}
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
