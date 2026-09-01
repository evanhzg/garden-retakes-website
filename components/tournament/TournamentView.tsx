"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import Bracket, { type BracketMatch } from "./Bracket";
import { placeholderBracket } from "@/lib/tournament/bracket";
import Rules, { type RulesFacts } from "./Rules";
import Results, { type Podium } from "./Results";
import type { MatchPreview } from "@/lib/tournament/preview";
import type { PlayerTotals } from "@/lib/tournament/stats";
import "./view.css";
import StatusTag from "./StatusTag";

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
  /**
   * The standing team this entry belongs to, if any.
   *
   * A TournamentTeam is one roster in one tournament — it has no page of its
   * own. GardenTeam does, and TournamentTeam.GardenTeamId is the link. Null
   * for a side thrown together for one bracket, which is most of them.
   */
  slug: string | null;
  players: { steamId: string; name: string; captain: boolean; roleT: string | null; roleCt: string | null }[];
};

export type PoolMap = { map: string; label: string; image: string | null };

// "pool" is gone: the map pool moved into the rules tab, where it is one
// section of a page instead of a whole tab holding a single sentence.
type Tab = "results" | "bracket" | "teams" | "stats" | "rules";

export default function TournamentView({
  stages,
  teams,
  stats,
  pool,
  previews,
  rules,
  slug,
  isPickup = false,
  name,
  podium,
}: {
  stages: StageView[];
  teams: TeamView[];
  stats: (PlayerTotals & { teamName: string | null })[];
  pool: PoolMap[];
  previews: Record<number, MatchPreview>;
  rules: RulesFacts;
  slug: string;
  /**
   * A matchmaking event rather than a bracket somebody organised.
   *
   * Recognised by the slug the pickup path writes, because that is what the
   * page already has — a column for it would be a migration for one boolean
   * that one component reads.
   */
  isPickup?: boolean;
  name: string;
  /** Empty until the bracket has a decided final. */
  podium: Podium[];
}) {
  const { t } = useI18n();

  // A finished tournament opens on its result.
  //
  // Everything else here is a working surface — a bracket to navigate, a table
  // to compare — and none of it answers the question somebody arrives with
  // after the event is over. Landing them on the bracket and making them find
  // the final is three clicks to reach the one fact they came for.
  const [tab, setTab] = useState<Tab>(podium.length > 0 ? "results" : "bracket");

  const TABS: { id: Tab; label: string; count?: number }[] = [
    // Only present once there is a result to show. An empty podium tab on a
    // tournament that has not started is a promise nobody asked for.
    ...(podium.length > 0
      ? [{ id: "results" as Tab, label: t("tournaments.tabs.results") }]
      : []),
    { id: "bracket", label: t("tournaments.tabs.bracket"), count: stages.length },
    // No roster tab on a pickup event.
    //
    // Matchmaking files every game into one long-running tournament, so its
    // "teams" are two throwaway sides per match — hundreds of them, named after
    // whoever captained, most of them the same six people in a different
    // arrangement. A tab listing all of that answers no question anybody has,
    // and it is the tab that grows without bound.
    ...(isPickup
      ? []
      : [{ id: "teams" as Tab, label: t("tournaments.tabs.teams"), count: teams.length }]),
    { id: "stats", label: t("tournaments.tabs.stats"), count: stats.length },
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
        {tab === "results" && (
          <Results podium={podium} players={stats} teams={teams} tournamentName={name} />
        )}
        {tab === "bracket" && <BracketPanel stages={stages} previews={previews} slug={slug} rules={rules} />}
        {tab === "teams" && !isPickup && <TeamsPanel teams={teams} />}
        {tab === "stats" && <StatsPanel stats={stats} />}
        {tab === "rules" && <Rules facts={rules} />}
      </div>
    </section>
  );
}

function BracketPanel({
  stages,
  previews,
  slug,
  rules,
}: {
  stages: StageView[];
  previews: Record<number, MatchPreview>;
  slug: string;
  /** Only for the empty-state preview, which needs the planned team count. */
  rules: RulesFacts;
}) {
  const { t } = useI18n();

  // No stages yet is the normal state of a tournament somebody is still
  // setting up, and it used to render one line of grey text. That tells an
  // organizer nothing about what they are building and a visitor nothing about
  // what they are entering, so the tree is drawn empty instead — same
  // component, same shape it will really have, every slot blank.
  if (stages.length === 0) {
    return (
      <div className="tv-stages">
        <section className="tv-stage tv-preview">
          <div className="tv-preview-note">
            <strong>{t("tournaments.previewTitle")}</strong>
            <span>{t("tournaments.previewHint", { n: String(rules.maxTeams) })}</span>
          </div>

          <Bracket matches={placeholderBracket(rules.maxTeams, rules.bestOf, rules.finalBestOf ?? undefined)} />
        </section>
      </div>
    );
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
            {/* A tag is a name, not a state and not a control — it was a .chip,
                so it offered a pointer cursor and a hover lift for something
                that does nothing. */}
            {team.tag && <span className="tv-tag">{team.tag}</span>}
            {/* Openable when the entry belongs to a standing team. A name
                invented for one bracket has nowhere to go, and a link that
                404s is worse than plain text. */}
            {team.slug ? (
              <h3>
                <Link className="tv-team-link" href={`/teams/${team.slug}`}>
                  {team.name}
                </Link>
              </h3>
            ) : (
              <h3>{team.name}</h3>
            )}
            <StatusTag kind="team" value={team.status} />
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

