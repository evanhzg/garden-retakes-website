"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy, Medal, Users, CalendarDays } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import TabMark from "@/components/TabMark";
import LeaderboardTabs, { type Board } from "@/components/stats/LeaderboardTabs";
import type { ArchiveEntry, TeamRanking, ScheduledTournament } from "@/lib/tournament/hub";
import "./hub.css";

// The tournaments hub.
//
// The page was a list and nothing else, so everything the site knows about
// tournaments that is not "here are some tournaments" had nowhere to live —
// who has won anything, who is playing well, what is coming. All four panels
// are read off rows that already exist; none of it is a new table.

type Tab = "live" | "archive" | "players" | "teams" | "schedule";

export default function HubTabs({
  children,
  archive,
  teams,
  boards,
  schedule,
}: {
  /** The tournament list itself, rendered on the server. */
  children: React.ReactNode;
  archive: ArchiveEntry[];
  teams: TeamRanking[];
  boards: Board[];
  schedule: ScheduledTournament[];
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("live");

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "live", label: t("hub.current"), icon: <Trophy size={15} /> },
    { id: "schedule", label: t("hub.schedule"), icon: <CalendarDays size={15} />, count: schedule.length },
    { id: "archive", label: t("hub.archive"), icon: <Medal size={15} />, count: archive.length },
    { id: "teams", label: t("hub.teams"), icon: <Users size={15} />, count: teams.length },
    { id: "players", label: t("hub.players"), icon: <Trophy size={15} />, count: boards.length },
  ];

  return (
    <>
      <div className="pro-tabs hub-tabs" role="tablist" aria-label={t("hub.aria")}>
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            id={`hub-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`hub-panel-${item.id}`}
            className={`pro-tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
            {item.label}
            {item.count ? <span className="pro-tab-count">{item.count}</span> : null}
            {tab === item.id && <TabMark group="hub" />}
          </button>
        ))}
      </div>

      <div className="pro-panel" role="tabpanel" id={`hub-panel-${tab}`} aria-labelledby={`hub-tab-${tab}`}>
        {tab === "live" && children}
        {tab === "schedule" && <Schedule rows={schedule} />}
        {tab === "archive" && <Archive rows={archive} />}
        {tab === "teams" && <TeamTable rows={teams} />}
        {tab === "players" && <PlayerBoards boards={boards} />}
      </div>
    </>
  );
}

function Schedule({ rows }: { rows: ScheduledTournament[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="muted">{t("hub.noSchedule")}</p>;

  return (
    <ul className="hub-schedule">
      {rows.map((row) => {
        const when = row.startsAt ? new Date(row.startsAt) : null;
        return (
          <li key={row.id} className="hub-sched">
            {/* The date as a block rather than a sentence: a column of these
                is scannable, a column of "starts on Tuesday the…" is not. */}
            <div className="hub-date">
              {when ? (
                <>
                  <span className="hub-day">{when.toLocaleDateString(undefined, { day: "numeric" })}</span>
                  <span className="hub-month">
                    {when.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </>
              ) : (
                <span className="hub-tbd">{t("hub.tbd")}</span>
              )}
            </div>

            <div className="hub-sched-main">
              <Link className="hub-sched-name" href={`/tournaments/${row.slug}`}>
                {row.name}
              </Link>
              <span className="muted">
                {row.teamSize}v{row.teamSize} · {row.teamCount} / {row.maxTeams}{" "}
                {t("tournaments.teams").toLowerCase()}
                {when ? ` · ${when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
            </div>

            <Link className="btn hub-btn" href={`/tournaments/${row.slug}`}>
              {t("tournaments.view")}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Archive({ rows }: { rows: ArchiveEntry[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="muted">{t("hub.noArchive")}</p>;

  const PLACE = ["", "hub-gold", "hub-silver", "hub-bronze"];

  return (
    <ul className="hub-archive">
      {rows.map((row) => (
        <li key={row.id} className="hub-past">
          <div className="hub-past-head">
            <Link className="hub-past-name" href={`/tournaments/${row.slug}`}>
              {row.name}
            </Link>
            <span className="muted">
              {row.teamSize}v{row.teamSize} · {row.teamCount} {t("tournaments.teams").toLowerCase()}
              {row.finishedAt
                ? ` · ${new Date(row.finishedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}`
                : ""}
            </span>
          </div>

          {row.podium.length === 0 ? (
            <p className="muted">{t("hub.noPodium")}</p>
          ) : (
            <ol className="hub-podium">
              {row.podium.map((p) => (
                <li key={`${p.place}-${p.teamId}`} className={`hub-place ${PLACE[p.place] ?? ""}`}>
                  <span className="hub-rank">{p.place}</span>
                  <span className="hub-team">{p.name}</span>
                  {p.tag && <span className="tv-tag">{p.tag}</span>}
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}

function TeamTable({ rows }: { rows: TeamRanking[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="muted">{t("hub.noTeams")}</p>;

  return (
    <div className="pro-tablewrap">
      <table className="table num">
        <thead>
          <tr>
            <th>#</th>
            <th>{t("tournaments.team")}</th>
            <th className="r">{t("hub.events")}</th>
            <th className="r">{t("hub.titles")}</th>
            <th className="r">{t("hub.record")}</th>
            <th className="r">{t("tournaments.diff")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.name}-${i}`}>
              <td className="muted">{i + 1}</td>
              <td>
                {row.name}
                {row.tag && <span className="tv-tag">{row.tag}</span>}
              </td>
              <td className="r">{row.tournaments}</td>
              <td className="r">{row.wins > 0 ? <strong>{row.wins}</strong> : "—"}</td>
              <td className="r">
                {row.matchesWon}–{row.matchesLost}
              </td>
              <td className={`r ${row.diff > 0 ? "positive" : row.diff < 0 ? "negative" : ""}`}>
                {row.diff > 0 ? `+${row.diff}` : row.diff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerBoards({ boards }: { boards: Board[] }) {
  const { t } = useI18n();
  if (boards.length === 0) return <p className="muted">{t("tstats.empty")}</p>;

  return (
    <>
      <p className="muted hub-note">{t("hub.playersNote")}</p>
      <LeaderboardTabs boards={boards} />
    </>
  );
}
