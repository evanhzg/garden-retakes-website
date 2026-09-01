"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  CalendarDays,
  Crown,
  Globe2,
  Layers,
  Trophy,
  Users,
} from "lucide-react";

import AvatarImage from "@/components/AvatarImage";
import PlayerBubble from "@/components/social/PlayerBubble";
import LeaderboardTabs, { type Board } from "@/components/stats/LeaderboardTabs";
import { useI18n } from "@/components/I18nProvider";
import "./statshub.css";

/** One honour: a face, a reason, and three numbers. */
export type Honour = {
  steamId: string;
  name: string;
  rating: string;
  adr: string;
  rounds: string;
};

export type HubTournamentView = {
  id: number;
  slug: string;
  name: string;
  state: string;
  /**
   * Which half of the page it belongs to.
   *
   * Sent rather than worked out here. splitTournaments in
   * lib/tournament/honours.ts decides this — including that a draft or a
   * cancelled tournament belongs to neither half — and it is covered by tests.
   * Re-deriving it from `state` with a filter meant the rule existed twice and
   * only one copy was checked.
   */
  group: "current" | "past";
  /** ISO, or null. Dates cross the server/client boundary as strings. */
  startsAt: string | null;
  endedAt: string | null;
  rounds: number;
  teams: number;
  players: number;
  champion: string | null;
  boards: Board[];
};

type Props = {
  overall: Board[];
  tournaments: HubTournamentView[];
  mvp: Honour | null;
  potm: Honour | null;
  /** e.g. "August 2026", already localised by the server. */
  potmMonth: string;
  totals: { players: number; rounds: number; tournaments: number };
};

/**
 * The stats page's spine.
 *
 * What it replaces: one column of panels, every board stacked under the last,
 * with no way to ask about a single tournament and no way to tell which of
 * them a number came from. The rework is three ideas.
 *
 * The honours come FIRST, because a stats page opened by somebody who does not
 * already know what they are looking for should answer "who is good" before it
 * offers nine ways to sort a table.
 *
 * The tabs are one row: everything running, plus the archive. A tournament in
 * progress is a place you go back to, so it gets a tab of its own rather than
 * a row in a list; a finished one is a thing you look up, so it gets a card.
 *
 * And the archive is cards, not a table. A finished tournament has a shape —
 * who won, how many entered, when it happened — that a row of a table flattens
 * into four columns of the same weight.
 */
export default function StatsHub({ overall, tournaments, mvp, potm, potmMonth, totals }: Props) {
  const { t } = useI18n();

  // Order is the server's too: it arrives live-first, then newest-finished.
  const current = useMemo(() => tournaments.filter((x) => x.group === "current"), [tournaments]);
  const past = useMemo(() => tournaments.filter((x) => x.group === "past"), [tournaments]);

  /**
   * Which pane is showing.
   *
   * "overall" | "archive" | a tournament id. One value rather than a tab index
   * and a selected-tournament id, because those two can disagree — and when
   * they did, the tab bar said Archive while the table underneath it showed a
   * tournament.
   */
  const [view, setView] = useState<string>("overall");

  const openTournament = tournaments.find((x) => String(x.id) === view) ?? null;
  const inArchive = view === "archive";

  /**
   * One player, both titles.
   *
   * Early on — and any month where one person simply played the best — the MVP
   * and the player of the month are the same person with the same three
   * numbers, and two identical cards side by side read as a rendering fault
   * rather than as a fact about the month. So they collapse into one card that
   * says both, which is the honest version and the better-looking one.
   */
  const sweep = mvp !== null && potm !== null && mvp.steamId === potm.steamId;

  /**
   * Which tab reads as current.
   *
   * Not always `view`: opening a finished tournament from the archive sets
   * view to its id, and no tab has that id — so the marker vanished and the
   * bar said "you are nowhere" while the pane below it showed a tournament.
   * A tournament reached through the archive keeps the archive lit, which is
   * also where its back button goes.
   */
  const activeTab = openTournament && openTournament.group === "past" ? "archive" : view;

  const dateLabel = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
      : "—";

  return (
    <div className="sh">
      {/* ------------------------------------------------------------ honours */}
      {(mvp || potm) && (
        <section className={`sh-honours ${sweep ? "is-sweep" : ""}`}>
          {mvp && (
            <HonourCard
              kind="mvp"
              icon={<Crown size={15} />}
              label={sweep ? `${t("stats.hub.mvp")} · ${t("stats.hub.potm")}` : t("stats.hub.mvp")}
              caption={sweep ? `${t("stats.hub.mvpWhy")} · ${potmMonth}` : t("stats.hub.mvpWhy")}
              person={mvp}
              t={t}
            />
          )}
          {potm && !sweep && (
            <HonourCard
              kind="potm"
              icon={<CalendarDays size={15} />}
              label={t("stats.hub.potm")}
              caption={potmMonth}
              person={potm}
              t={t}
            />
          )}

          <div className="sh-totals">
            <Total icon={<Trophy size={14} />} value={totals.tournaments} label={t("stats.hub.tournaments")} />
            <Total icon={<Users size={14} />} value={totals.players} label={t("tstats.players")} />
            <Total icon={<Activity size={14} />} value={totals.rounds} label={t("tstats.rounds")} />
          </div>
        </section>
      )}

      {/* --------------------------------------------------------------- tabs */}
      <nav className="sh-tabs" role="tablist" aria-label={t("stats.hub.tabsLabel")}>
        <Tab id="overall" view={activeTab} onPick={setView} icon={<Globe2 size={14} />}>
          {t("stats.hub.overall")}
        </Tab>

        {current.map((x) => (
          <Tab
            key={x.id}
            id={String(x.id)}
            view={activeTab}
            onPick={setView}
            icon={x.state === "live" ? <span className="sh-live-dot" aria-hidden /> : <Calendar size={14} />}
          >
            {x.name}
          </Tab>
        ))}

        {past.length > 0 && (
          <Tab id="archive" view={activeTab} onPick={setView} icon={<Layers size={14} />}>
            {t("stats.hub.archive")}
            <span className="sh-tab-count">{past.length}</span>
          </Tab>
        )}
      </nav>

      {/* -------------------------------------------------------------- panes */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          {view === "overall" && (
            <div className="panel sh-pane">
              <header className="sh-pane-head">
                <div>
                  <h3>{t("tstats.title")}</h3>
                  <p className="muted">{t("tstats.subtitle")}</p>
                </div>
                <Link className="sh-ghost" href="/tournaments">
                  {t("tstats.browse")}
                  <ArrowRight size={14} />
                </Link>
              </header>
              <LeaderboardTabs boards={overall} />
            </div>
          )}

          {inArchive && (
            <div className="sh-cards">
              {past.map((x) => (
                <motion.button
                  key={x.id}
                  className="sh-card"
                  onClick={() => setView(String(x.id))}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.14 }}
                >
                  <span className="sh-card-top">
                    <span className="sh-card-badge">
                      {x.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="sh-card-when">{dateLabel(x.endedAt ?? x.startsAt)}</span>
                  </span>

                  <span className="sh-card-name">{x.name}</span>

                  {x.champion && (
                    <span className="sh-card-champ">
                      <Trophy size={13} />
                      {x.champion}
                    </span>
                  )}

                  <span className="sh-card-facts">
                    <b>{x.teams}</b> {t("stats.hub.teams")}
                    <i aria-hidden>·</i>
                    <b>{x.players}</b> {t("tstats.players").toLowerCase()}
                    <i aria-hidden>·</i>
                    <b>{x.rounds}</b> {t("tstats.rounds").toLowerCase()}
                  </span>

                  <span className="sh-card-go">
                    {t("stats.hub.openBoards")}
                    <ArrowUpRight size={14} />
                  </span>
                </motion.button>
              ))}
            </div>
          )}

          {openTournament && (
            <div className="panel sh-pane">
              <header className="sh-pane-head">
                <div>
                  {/* Back to where it was opened from, and only when it was
                      opened from there — a tournament that has its own tab was
                      not reached through the archive. */}
                  {openTournament.group === "past" && (
                    <button className="sh-back" onClick={() => setView("archive")}>
                      <ChevronLeft size={13} />
                      {t("stats.hub.archive")}
                    </button>
                  )}
                  <h3>{openTournament.name}</h3>
                  <p className="muted">
                    {openTournament.champion ? (
                      <>
                        <Trophy size={12} /> {openTournament.champion} ·{" "}
                      </>
                    ) : null}
                    {openTournament.teams} {t("stats.hub.teams")} · {openTournament.rounds}{" "}
                    {t("tstats.rounds").toLowerCase()}
                  </p>
                </div>
                <Link className="sh-ghost" href={`/tournaments/${openTournament.slug}`}>
                  {t("stats.hub.openTournament")}
                  <ArrowRight size={14} />
                </Link>
              </header>
              <LeaderboardTabs boards={openTournament.boards} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** One tab. The marker is a single element framer moves between them. */
function Tab({
  id,
  view,
  onPick,
  icon,
  children,
}: {
  id: string;
  view: string;
  onPick: (id: string) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const on = view === id;
  return (
    <button
      role="tab"
      aria-selected={on}
      className={`sh-tab ${on ? "on" : ""}`}
      onClick={() => onPick(id)}
    >
      {icon}
      <span>{children}</span>
      {on && (
        <motion.span
          className="sh-tab-mark"
          layoutId="shTabMark"
          transition={{ type: "spring", stiffness: 520, damping: 42 }}
        />
      )}
    </button>
  );
}

function Total({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="sh-total">
      <span className="sh-total-k">
        {icon}
        {label}
      </span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function HonourCard({
  kind,
  icon,
  label,
  caption,
  person,
  t,
}: {
  kind: "mvp" | "potm";
  icon: React.ReactNode;
  label: string;
  caption: string;
  person: Honour;
  t: (k: string) => string;
}) {
  return (
    <motion.article
      className={`sh-honour is-${kind}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="sh-honour-label">
        {icon}
        {label}
      </span>

      <PlayerBubble steamId={person.steamId} name={person.name}>
        <span className="sh-honour-who">
          <AvatarImage steamId={person.steamId} alt={person.name} className="sh-honour-face" />
          <span className="sh-honour-lines">
            <span className="sh-honour-name">{person.name}</span>
            <span className="sh-honour-cap">{caption}</span>
          </span>
        </span>
      </PlayerBubble>

      <dl className="sh-honour-stats">
        <div>
          <dt>{t("tstats.rating")}</dt>
          <dd>{person.rating}</dd>
        </div>
        <div>
          <dt>{t("tstats.adr")}</dt>
          <dd>{person.adr}</dd>
        </div>
        <div>
          <dt>{t("tstats.rounds")}</dt>
          <dd>{person.rounds}</dd>
        </div>
      </dl>
    </motion.article>
  );
}
