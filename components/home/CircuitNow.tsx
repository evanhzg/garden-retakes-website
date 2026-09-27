import Link from "next/link";
import { ArrowRight, CalendarDays, Medal, Swords } from "lucide-react";
import { prisma } from "@/lib/db";
import { getT, serverLocale } from "@/lib/serverI18n";
import { teamRankings, upcomingTournaments } from "@/lib/tournament/hub";
import LiveStrip from "./LiveStrip";
import "./circuit-now.css";

/**
 * "The circuit, right now" — the homepage's proof of life.
 *
 * Everything else on the homepage explains how Blitz works; none of it said
 * whether anybody is playing it. This is three honest lists straight from the
 * tables the tournament pages already read — what is next, what just finished,
 * who is on top — plus a live line for the public server. Published events
 * only, the same rule as the counts in the hero.
 *
 * A list with nothing in it is left out rather than drawn empty, and the whole
 * section goes when all three are empty — a fresh install should not open with
 * three boxes saying "nothing yet".
 */
export default async function CircuitNow() {
  const t = getT();
  const locale = serverLocale() === "fr" ? "fr-FR" : "en-GB";

  const [upcoming, results, ranking] = await Promise.all([
    upcomingTournaments([], 3).catch(() => []),
    prisma.tournamentMatch
      .findMany({
        where: {
          State: "finished",
          Tournament: { Published: true },
          TeamAId: { not: null },
          TeamBId: { not: null },
        },
        orderBy: [{ EndedAt: "desc" }, { Id: "desc" }],
        take: 5,
        select: {
          Id: true,
          ScoreA: true,
          ScoreB: true,
          WinnerTeamId: true,
          TeamAId: true,
          TeamBId: true,
          EndedAt: true,
          Tournament: { select: { Slug: true, Name: true } },
          Maps: { select: { Map: true }, orderBy: { Ordinal: "asc" } },
        },
      })
      .catch(() => []),
    teamRankings([], 5).catch(() => []),
  ]);

  const teamIds = results.flatMap((m) => [m.TeamAId, m.TeamBId]).filter((x): x is number => x !== null);
  const teams = teamIds.length
    ? await prisma.tournamentTeam.findMany({ where: { Id: { in: teamIds } }, select: { Id: true, Name: true } }).catch(() => [])
    : [];
  const teamName = (id: number | null) => teams.find((x) => x.Id === id)?.Name ?? "TBD";

  const date = (iso: string | Date | null, withTime = false) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          day: "numeric",
          month: "short",
          ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        })
      : t("circuit.tbd");

  const hasAny = upcoming.length > 0 || results.length > 0 || ranking.length > 0;

  return (
    <section className="cn" aria-labelledby="cn-title">
      <div className="cn-head">
        <h2 id="cn-title" className="cn-title">
          {t("circuit.title")}
        </h2>
        <LiveStrip />
      </div>

      {hasAny && (
        <div className="cn-grid">
          {upcoming.length > 0 && (
            <div className="cn-col">
              <h3>
                <CalendarDays size={14} /> {t("circuit.next")}
              </h3>
              <ul>
                {upcoming.map((u) => {
                  const open = u.state === "registration";
                  // A running event has no "when" worth printing — "date to be
                  // set" beside something being played right now reads as a
                  // mistake. It says Live instead.
                  const live = u.state === "live";
                  return (
                    <li key={u.id}>
                      <Link href={`/tournaments/${u.slug}`} className="cn-item">
                        <span className="cn-item-main">
                          <strong>{u.name}</strong>
                          <span className="cn-meta">
                            {live ? null : <>{date(u.startsAt, true)} · </>}
                            {u.teamSize}v{u.teamSize} · {u.teamCount}/{u.maxTeams} {t("tournaments.teams").toLowerCase()}
                          </span>
                        </span>
                        {live && <span className="cn-badge live">{t("circuit.live")}</span>}
                        {open && <span className="cn-badge">{t("circuit.open")}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {results.length > 0 && (
            <div className="cn-col">
              <h3>
                <Swords size={14} /> {t("circuit.results")}
              </h3>
              <ul>
                {results.map((m) => {
                  const aWon = m.WinnerTeamId === m.TeamAId;
                  const bWon = m.WinnerTeamId === m.TeamBId;
                  return (
                    <li key={m.Id}>
                      <Link href={`/tournaments/${m.Tournament.Slug}/match/${m.Id}`} className="cn-item cn-result">
                        <span className="cn-item-main">
                          <span className="cn-score">
                            <span className={aWon ? "win" : ""}>{teamName(m.TeamAId)}</span>
                            <span className="num cn-nums">
                              <b className={aWon ? "win" : ""}>{m.ScoreA}</b>
                              <span>–</span>
                              <b className={bWon ? "win" : ""}>{m.ScoreB}</b>
                            </span>
                            <span className={bWon ? "win" : ""}>{teamName(m.TeamBId)}</span>
                          </span>
                          <span className="cn-meta">
                            {m.Tournament.Name}
                            {m.Maps.length > 0 && ` · ${m.Maps.map((x) => x.Map.replace(/^(de|cs)_/, "")).join(", ")}`}
                            {m.EndedAt && ` · ${date(m.EndedAt)}`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {ranking.length > 0 && (
            <div className="cn-col">
              <h3>
                <Medal size={14} /> {t("circuit.top")}
              </h3>
              <ol className="cn-rank">
                {ranking.map((r, i) => {
                  const inner = (
                    <>
                      <span className="cn-pos num">{String(i + 1).padStart(2, "0")}</span>
                      <span className="cn-item-main">
                        <strong>
                          {r.tag && <span className="cn-tag">{r.tag}</span>}
                          {r.name}
                        </strong>
                        <span className="cn-meta num">
                          {r.matchesWon}–{r.matchesLost} · {r.diff > 0 ? `+${r.diff}` : r.diff} {t("circuit.rounds")}
                          {r.wins > 0 && ` · ${t("circuit.titles", { n: r.wins })}`}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={`${r.name}-${i}`}>
                      {r.slug ? (
                        <Link href={`/teams/${r.slug}`} className="cn-item">
                          {inner}
                        </Link>
                      ) : (
                        <span className="cn-item">{inner}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
              <Link href="/tournaments" className="cn-more">
                {t("circuit.allRankings")} <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
