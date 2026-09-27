import Link from "next/link";
import { prisma } from "@/lib/db";
import { getT, serverLocale } from "@/lib/serverI18n";
import AvatarImage from "@/components/AvatarImage";
import RoleIcon from "@/components/tournament/RoleIcon";
import { roleLabel } from "@/lib/tournament/roles";
import { teamsOf } from "@/lib/tournament/teamStore";
import { allPlayerNames } from "@/lib/tournament/playerNames";
import { ExternalLink, GitCompare } from "lucide-react";
import CopyLinkButton from "@/components/tournament/CopyLinkButton";
import "./teams.css";
import "./demoprofile.css";

/** Rating across matches, oldest to newest, with the 1.00 line for reference. Plain SVG. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 180;
  const H = 44;
  const lo = Math.min(0.6, ...values);
  const hi = Math.max(1.4, ...values);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="dp-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <line x1={0} x2={W} y1={y(1)} y2={y(1)} className="dp-spark-base" />
      <polyline points={points} className="dp-spark-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} className="dp-spark-dot" />
    </svg>
  );
}

/**
 * A player, as a demo shows them.
 *
 * The full profile is six panels wide and most of it is about the retakes
 * ladder — ELO, per-map splits, minigame scores, playtime. None of that is what
 * a tournament is being pitched on, and a demo that opens with a season's worth
 * of ladder numbers is a demo about the wrong product.
 *
 * So: tournament figures only — the full line (rating with its trend, K/D,
 * ADR, KAST, headshots, entries, clutches), every match they played with the
 * result and their own rating in it, where they have been, who they play with
 * and what they play. Plus the three things people do from a player page:
 * compare, open Steam, share.
 *
 * Everything defaults to nothing. A player with no tournament behind them gets
 * a page that says so plainly rather than a grid of zeroes, because a zero is a
 * claim — it says "played, scored none" — and an empty state is the truth.
 */

export default async function DemoProfile({ steamId }: { steamId: string }) {
  const t = getT();
  const locale = serverLocale();
  const id = BigInt(steamId);

  const [names, stats, entries, teams, roles] = await Promise.all([
    // WHO THIS PAGE IS ABOUT. The heading was the literal word "Player" — a
    // profile that never says whose it is, on the page a tournament links to
    // from every scoreboard row. The name is one lookup away and every other
    // surface on the site already does it.
    allPlayerNames([id]).catch(() => ({}) as Record<string, string>),

    prisma.tournamentPlayerStat.findMany({ where: { SteamId: id } }),

    prisma.tournamentTeamMember.findMany({
      where: { SteamId: id, Status: { not: "removed" } },
      include: {
        Team: {
          include: {
            Tournament: { select: { Name: true, Slug: true, StartedAt: true } },
          },
        },
      },
      orderBy: { Id: "desc" },
      take: 20,
    }),

    teamsOf(steamId).catch(() => []),

    // What they actually play, counted across every tournament roster they
    // have been on. A preference is a habit, not a setting.
    prisma.tournamentTeamMember.findMany({
      where: { SteamId: id, Status: { not: "removed" } },
      select: { RoleT: true, RoleCt: true },
    }),
  ]);

  // Rounds-weighted, never a mean of means — the same rule lib/tournament/stats.ts
  // states and for the same reason: averaging per-match averages weights a
  // three-round appearance the same as a full map.
  const sum = (pick: (s: (typeof stats)[number]) => number) => stats.reduce((n, s) => n + pick(s), 0);
  const rounds = sum((s) => s.RoundsPlayed);
  const kills = sum((s) => s.Kills);
  const deaths = sum((s) => s.Deaths);
  const assists = sum((s) => s.Assists);
  const damage = sum((s) => s.Damage);
  const headshots = sum((s) => s.Headshots);
  const kastRounds = sum((s) => s.KastRounds);
  const entryKills = sum((s) => s.EntryKills);
  const entryDeaths = sum((s) => s.EntryDeaths);
  const clutches = sum((s) => s.Clutches);
  const rating = rounds > 0 ? sum((s) => s.Rating * s.RoundsPlayed) / rounds : 0;

  // ---- per match: one line per series, maps summed, rating rounds-weighted ----
  const perMatch = new Map<number, { kills: number; deaths: number; rounds: number; ratingW: number; damage: number; teamId: number | null }>();
  for (const s of stats) {
    const m = perMatch.get(s.MatchId) ?? { kills: 0, deaths: 0, rounds: 0, ratingW: 0, damage: 0, teamId: s.TeamId };
    m.kills += s.Kills;
    m.deaths += s.Deaths;
    m.rounds += s.RoundsPlayed;
    m.damage += s.Damage;
    m.ratingW += s.Rating * s.RoundsPlayed;
    m.teamId ??= s.TeamId;
    perMatch.set(s.MatchId, m);
  }
  const matchRows = perMatch.size
    ? await prisma.tournamentMatch
        .findMany({
          where: { Id: { in: Array.from(perMatch.keys()) } },
          select: {
            Id: true,
            TeamAId: true,
            TeamBId: true,
            ScoreA: true,
            ScoreB: true,
            WinnerTeamId: true,
            State: true,
            EndedAt: true,
            StartedAt: true,
            Tournament: { select: { Slug: true, Name: true } },
            Maps: { select: { Map: true }, orderBy: { Ordinal: "asc" } },
          },
        })
        .catch(() => [])
    : [];
  const matchTeamIds = matchRows.flatMap((m) => [m.TeamAId, m.TeamBId]).filter((x): x is number => x !== null);
  const matchTeams = matchTeamIds.length
    ? await prisma.tournamentTeam.findMany({ where: { Id: { in: matchTeamIds } }, select: { Id: true, Name: true } }).catch(() => [])
    : [];
  const teamLabel = (tid: number | null) => matchTeams.find((x) => x.Id === tid)?.Name ?? "TBD";
  // A stat row's TeamId can be missing on old matches; the roster says which
  // side they were on in that tournament instead.
  const rosterTeamIds = new Set(entries.map((e) => e.TeamId));

  const history = matchRows
    .map((m) => {
      const mine = perMatch.get(m.Id)!;
      const myTeam =
        mine.teamId ?? (m.TeamAId !== null && rosterTeamIds.has(m.TeamAId) ? m.TeamAId : m.TeamBId);
      const onA = myTeam === m.TeamAId;
      const result: "W" | "L" | "—" = m.WinnerTeamId === null ? "—" : m.WinnerTeamId === myTeam ? "W" : "L";
      return {
        id: m.Id,
        slug: m.Tournament.Slug,
        event: m.Tournament.Name,
        when: m.EndedAt ?? m.StartedAt,
        opponent: teamLabel(onA ? m.TeamBId : m.TeamAId),
        score: onA ? `${m.ScoreA}–${m.ScoreB}` : `${m.ScoreB}–${m.ScoreA}`,
        result,
        maps: m.Maps.map((x) => x.Map.replace(/^(de|cs)_/, "")),
        kd: `${mine.kills}–${mine.deaths}`,
        adr: mine.rounds ? Math.round(mine.damage / mine.rounds) : 0,
        rating: mine.rounds ? mine.ratingW / mine.rounds : 0,
      };
    })
    .sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0));
  const matchesPlayed = history.length;
  const wins = history.filter((h) => h.result === "W").length;
  const decided = history.filter((h) => h.result !== "—").length;

  // Oldest to newest, for the trend line.
  const trend = history
    .filter((h) => h.rating > 0)
    .slice(0, 20)
    .reverse()
    .map((h) => h.rating);

  const played = entries.length;

  const placings = entries
    .filter((e) => e.Team.Tournament.StartedAt)
    .slice(0, 6);

  const tally = (list: (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const r of list) {
      if (!r) continue;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    // Array.from rather than a spread: tsconfig targets below ES2015 here, and
    // spreading a Map iterator needs downlevelIteration.
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  };

  const tRoles = tally(roles.map((r) => r.RoleT));
  const ctRoles = tally(roles.map((r) => r.RoleCt));

  const nothing = rounds === 0 && played === 0 && teams.length === 0;

  // Falls back to the generic word, which is what a player with no name
  // anywhere in the system genuinely is — a bot, or an id nobody has met.
  const name = names[steamId] || t("demoProfile.title");

  return (
    <>
      <section className="panel dp-head">
        <AvatarImage steamId={steamId} className="dp-face" alt="" />
        <div className="dp-id">
          <h1>{name}</h1>
          <p className="muted">
            {nothing
              ? t("demoProfile.blurb")
              : [
                  played > 0 && t("demoProfile.sum.events", { n: played }),
                  matchesPlayed > 0 && t("demoProfile.sum.matches", { n: matchesPlayed }),
                  decided > 0 && t("demoProfile.sum.record", { w: wins, l: decided - wins }),
                  teams.length > 0 && t("demoProfile.sum.teams", { n: teams.length }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
        {/* What people do from a player page: put them next to somebody,
            open their Steam, send the page to a friend. */}
        <div className="dp-actions">
          <Link className="btn btn-secondary" href={`/stats/compare?a=${steamId}`}>
            <GitCompare size={15} /> {t("demoProfile.compare")}
          </Link>
          <a
            className="btn btn-secondary"
            href={`https://steamcommunity.com/profiles/${steamId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} /> Steam
          </a>
          <CopyLinkButton label={t("demoProfile.copyLink")} copiedLabel={t("demoProfile.copied")} />
        </div>
      </section>

      {nothing ? (
        <section className="panel">
          <div className="empty-hint">
            <p style={{ margin: 0 }}>{t("demoProfile.nothing")}</p>
          </div>
        </section>
      ) : (
        <>
          {rounds > 0 && (
            <section className="panel dp-statpanel">
              <div className="dp-lead-block">
                <span className="dp-lead-label">{t("tstats.rating")}</span>
                <span className={`num dp-lead ${rating >= 1.1 ? "good" : rating < 0.9 ? "poor" : ""}`}>
                  {rating.toFixed(2)}
                </span>
                {trend.length >= 2 && <Sparkline values={trend} label={t("demoProfile.trend")} />}
              </div>
              <dl className="dp-stats">
                <div>
                  <dt>{t("demoProfile.kd")}</dt>
                  <dd className="num">{(kills / Math.max(1, deaths)).toFixed(2)}</dd>
                </div>
                <div>
                  <dt>{t("scoreboard.kda")}</dt>
                  <dd className="num">
                    {kills}–{deaths}–{assists}
                  </dd>
                </div>
                <div>
                  <dt>{t("tstats.adr")}</dt>
                  <dd className="num">{Math.round(damage / rounds)}</dd>
                </div>
                <div>
                  <dt>KAST</dt>
                  <dd className="num">{Math.round((kastRounds / rounds) * 100)}%</dd>
                </div>
                <div>
                  <dt>{t("demoProfile.hs")}</dt>
                  <dd className="num">{kills ? Math.round((headshots / kills) * 100) : 0}%</dd>
                </div>
                <div>
                  <dt>{t("demoProfile.entries")}</dt>
                  <dd className="num">
                    {entryKills}–{entryDeaths}
                  </dd>
                </div>
                <div>
                  <dt>{t("demoProfile.clutches")}</dt>
                  <dd className="num">{clutches}</dd>
                </div>
                <div>
                  <dt>{t("demoProfile.rounds")}</dt>
                  <dd className="num">{rounds}</dd>
                </div>
              </dl>
            </section>
          )}

          {history.length > 0 && (
            <section className="panel">
              <div className="admin-head">
                <h2>{t("demoProfile.history")}</h2>
              </div>
              <div className="dp-table-wrap">
                <table className="dp-table">
                  <thead>
                    <tr>
                      <th aria-label={t("demoProfile.col.result")} />
                      <th>{t("demoProfile.col.opponent")}</th>
                      <th>{t("demoProfile.col.score")}</th>
                      <th className="dp-hide-sm">{t("demoProfile.col.maps")}</th>
                      <th>K–D</th>
                      <th className="dp-hide-sm">ADR</th>
                      <th>{t("tstats.rating")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 12).map((h) => (
                      <tr key={h.id}>
                        <td>
                          <span className={`dp-result ${h.result === "W" ? "w" : h.result === "L" ? "l" : ""}`}>{h.result}</span>
                        </td>
                        <td>
                          <Link href={`/tournaments/${h.slug}/match/${h.id}`} className="dp-opp">
                            {h.opponent}
                          </Link>
                          <span className="dp-event">
                            {h.event}
                            {h.when &&
                              ` · ${new Date(h.when).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" })}`}
                          </span>
                        </td>
                        <td className="num">{h.score}</td>
                        <td className="dp-hide-sm dp-maps">{h.maps.join(", ")}</td>
                        <td className="num">{h.kd}</td>
                        <td className="num dp-hide-sm">{h.adr}</td>
                        <td className={`num dp-rating ${h.rating >= 1.1 ? "good" : h.rating < 0.9 ? "poor" : ""}`}>
                          {h.rating.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {placings.length > 0 && (
            <section className="panel">
              <div className="admin-head">
                <h2>{t("demoProfile.recent")}</h2>
              </div>
              <ul className="tm-history">
                {placings.map((e) => (
                  <li key={e.Id}>
                    <Link className="tm-hrow" href={`/tournaments/${e.Team.Tournament.Slug}`}>
                      <span className="tm-htitle">{e.Team.Tournament.Name}</span>
                      <span className="muted tm-hwhen">{e.Team.Name}</span>
                      {/* toLocaleDateString() with no arguments takes the
                          SERVER's locale, which is why a French page showed
                          8/28/2026. Named month, both languages, and the same
                          shape the archive cards use. */}
                      <span className="muted tm-hrec">
                        {e.Team.Tournament.StartedAt
                          ? new Date(e.Team.Tournament.StartedAt).toLocaleDateString(
                              locale === "fr" ? "fr-FR" : "en-GB",
                              { day: "numeric", month: "short", year: "numeric" },
                            )
                          : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {teams.length > 0 && (
            <section className="panel">
              <div className="admin-head">
                <h2>{t("demoProfile.teams")}</h2>
              </div>
              <ul className="tm-list">
                {teams.map((x) => (
                  <li key={x.id}>
                    <Link className="tm-row" href={`/teams/${x.slug}`}>
                      <span className="tm-name">
                        {x.tag && <span className="tm-tag">{x.tag}</span>}
                        {x.name}
                      </span>
                      <span className="tm-role">{t(`teams.role.${x.role}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(tRoles.length > 0 || ctRoles.length > 0) && (
            <section className="panel">
              <div className="admin-head">
                <h2>{t("demoProfile.roles")}</h2>
              </div>

              <div className="dp-roles">
                {([["T", tRoles], ["CT", ctRoles]] as const).map(([side, list]) =>
                  list.length === 0 ? null : (
                    <div key={side} className="dp-role-col">
                      <h3>{t(side === "T" ? "roledraft.tSide" : "roledraft.ctSide")}</h3>
                      <ul>
                        {list.map(([role, n]) => (
                          <li key={role}>
                            <RoleIcon role={role} size={15} labelled={false} />
                            <span>{roleLabel(role)}</span>
                            <span className="muted num">{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
