"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import Bracket, { type BracketMatch } from "./Bracket";
import Rules, { type RulesFacts } from "./Rules";
import type { MatchPreview } from "@/lib/tournament/preview";
import type { PlayerTotals } from "@/lib/tournament/stats";
import "./view.css";

// A tournament, as tabs.
//
// It was one long scroll: bracket, then teams, then a line of map names. That
// works for a tournament with one stage and four teams and stops working at the
// size this is built for — and the question people arrive with ("how did my
// team do?", "who is topping the stats?") was always somewhere below the fold
// of a bracket wide enough to scroll sideways.
//
// The stats tab is the one that did not exist at all. It is the tournament's
// own leaderboard, not the ladder's: these numbers come from tournament matches
// only, which is why a player's tournament rating and their season rating are
// allowed to disagree.

export type StageView = {
  id: number;
  name: string;
  kind: string;
  matches: BracketMatch[];
  standings: { teamId: number; name: string; played: number; won: number; diff: number }[] | null;
};

export type TeamView = {
  id: number;
  seed: number | null;
  name: string;
  tag: string | null;
  status: string;
  players: { steamId: string; name: string; captain: boolean; roleT: string | null; roleCt: string | null }[];
};

export type PoolMap = { map: string; label: string; image: string | null };

type Tab = "bracket" | "teams" | "stats" | "pool" | "rules";

export default function TournamentView({
  stages,
  teams,
  stats,
  pool,
  previews,
  rules,
  slug,
}: {
  stages: StageView[];
  teams: TeamView[];
  stats: (PlayerTotals & { teamName: string | null })[];
  pool: PoolMap[];
  previews: Record<number, MatchPreview>;
  rules: RulesFacts;
  slug: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("bracket");

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "bracket", label: t("tournaments.tabs.bracket"), count: stages.length },
    { id: "teams", label: t("tournaments.tabs.teams"), count: teams.length },
    { id: "stats", label: t("tournaments.tabs.stats"), count: stats.length },
    { id: "pool", label: t("tournaments.tabs.pool"), count: pool.length },
    { id: "rules", label: t("tournaments.tabs.rules") },
  ];

  return (
    <section className="panel tv">
      <div className="pro-tabs" role="tablist" aria-label={t("tournaments.tabs.aria")}>
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            id={`tv-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`tv-panel-${item.id}`}
            className={`pro-tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.count ? <span className="pro-tab-count">{item.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="pro-panel" role="tabpanel" id={`tv-panel-${tab}`} aria-labelledby={`tv-tab-${tab}`}>
        {tab === "bracket" && <BracketPanel stages={stages} previews={previews} slug={slug} />}
        {tab === "teams" && <TeamsPanel teams={teams} />}
        {tab === "stats" && <StatsPanel stats={stats} />}
        {tab === "pool" && <PoolPanel pool={pool} />}
        {tab === "rules" && <Rules facts={rules} />}
      </div>
    </section>
  );
}

function BracketPanel({
  stages,
  previews,
  slug,
}: {
  stages: StageView[];
  previews: Record<number, MatchPreview>;
  slug: string;
}) {
  const { t } = useI18n();

  if (stages.length === 0) {
    return <p className="muted">{t("tournaments.noStages")}</p>;
  }

  return (
    <div className="tv-stages">
      {stages.map((stage) => (
        <section key={stage.id} className="tv-stage">
          <h3 className="tv-stage-name">
            {stage.name}
            <span className="tv-stage-kind">{stage.kind}</span>
          </h3>

          {/* A group is a table of standings; a bracket is a bracket. Drawing a
              group as a bracket is possible and says nothing about who is going
              through, which is the only question a group asks. */}
          {stage.standings ? (
            <div className="pro-tablewrap">
              <table className="table num">
                <thead>
                  <tr>
                    <th>{t("tournaments.team")}</th>
                    <th className="r">{t("tournaments.played")}</th>
                    <th className="r">{t("tournaments.won")}</th>
                    <th className="r">{t("tournaments.diff")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stage.standings.map((row) => (
                    <tr key={row.teamId}>
                      <td>{row.name}</td>
                      <td className="r">{row.played}</td>
                      <td className="r">{row.won}</td>
                      <td className={`r ${row.diff > 0 ? "positive" : row.diff < 0 ? "negative" : ""}`}>
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Bracket matches={stage.matches} previews={previews} slug={slug} />
          )}
        </section>
      ))}
    </div>
  );
}

function TeamsPanel({ teams }: { teams: TeamView[] }) {
  const { t } = useI18n();

  if (teams.length === 0) {
    return <p className="muted">{t("tournaments.noTeams")}</p>;
  }

  return (
    <div className="tv-teams">
      {teams.map((team) => (
        <article key={team.id} className={`tv-team st-${team.status}`}>
          <header className="tv-team-head">
            {team.seed !== null && <span className="tv-seed num">{team.seed}</span>}
            {team.tag && <span className="chip">{team.tag}</span>}
            <h3>{team.name}</h3>
            <span className="chip">{team.status}</span>
          </header>

          <ul className="tv-roster">
            {team.players.map((p) => (
              <li key={p.steamId}>
                <Link href={`/players/${p.steamId}`}>{p.name}</Link>
                {p.captain && <span className="tv-cap" title="Captain">★</span>}
                {(p.roleT || p.roleCt) && (
                  <span className="tv-roles">
                    {p.roleT ?? "—"} / {p.roleCt ?? "—"}
                  </span>
                )}
              </li>
            ))}
            {team.players.length === 0 && <li className="muted">{t("tournaments.noPlayers")}</li>}
          </ul>
        </article>
      ))}
    </div>
  );
}

function StatsPanel({ stats }: { stats: (PlayerTotals & { teamName: string | null })[] }) {
  const { t } = useI18n();

  if (stats.length === 0) {
    return (
      <div className="empty-hint">
        <p style={{ margin: 0 }}>{t("tournaments.noStats")}</p>
      </div>
    );
  }

  return (
    <>
      <p className="muted tv-note">{t("tournaments.statsNote")}</p>

      <div className="pro-tablewrap">
        <table className="table num tv-stats">
          <thead>
            <tr>
              <th>{t("tournaments.player")}</th>
              <th>{t("tournaments.team")}</th>
              <th className="r" title={t("tournaments.mapsPlayed")}>{t("tournaments.maps")}</th>
              <th className="r">K</th>
              <th className="r">D</th>
              <th className="r">A</th>
              <th className="r">K/D</th>
              <th className="r">ADR</th>
              <th className="r">KAST</th>
              <th className="r">HS</th>
              <th className="r" title={t("tournaments.entryKills")}>{t("tournaments.entries")}</th>
              <th className="r">{t("tournaments.clutches")}</th>
              <th className="r">{t("tournaments.rating")}</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.steamId}>
                <td>
                  <Link href={`/players/${row.steamId}`}>{row.name}</Link>
                </td>
                <td className="muted">{row.teamName ?? "—"}</td>
                <td className="r">{row.maps}</td>
                <td className="r">{row.kills}</td>
                <td className="r">{row.deaths}</td>
                <td className="r">{row.assists}</td>
                <td className="r">{row.kd.toFixed(2)}</td>
                <td className="r">{row.adr}</td>
                <td className="r">{row.kast}%</td>
                <td className="r">{row.hs}%</td>
                <td className="r">{row.entryKills}</td>
                <td className="r">{row.clutches}</td>
                <td className={`r tv-rating ${row.ratingAvg >= 1.1 ? "good" : row.ratingAvg < 0.9 ? "poor" : ""}`}>
                  {row.ratingAvg.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PoolPanel({ pool }: { pool: PoolMap[] }) {
  const { t } = useI18n();

  if (pool.length === 0) {
    return <p className="muted">{t("tournaments.noPool")}</p>;
  }

  return (
    <div className="tv-pool">
      {pool.map((m) => (
        <figure key={m.map} className="tv-map">
          {m.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.image} alt="" loading="lazy" />
          ) : (
            <span className="tv-map-blank" aria-hidden />
          )}
          <figcaption>
            {m.label}
            <span className="tv-map-file">{m.map}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
