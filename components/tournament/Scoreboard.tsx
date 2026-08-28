"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import type { Scoreboard as Board, ScoreboardRow } from "@/lib/tournament/scoreboard";
import { RolePair } from "./RoleIcon";
import { MvpCard } from "./MapCards";
import "./scoreboard.css";

// The match scoreboard: one tab per map, and the series across all of them.
//
// Three decisions worth stating.
//
// It is seeded from the server and then polled. A match page is a link people
// share, so it has to render its numbers without JavaScript having run; and a
// live map moves every round, so it cannot be static either. The `initial` prop
// is the first paint and the poll only replaces it.
//
// The tabs are maps. A BO3 asks three different questions — how is this map
// going, how did the last one go, who has been the best player of the series —
// and one merged table answers none of them. The series tab is a
// rounds-weighted aggregate, computed server-side, not an average of the three
// map ratings.
//
// Advanced is a toggle rather than a second page. The seven columns everybody
// reads are always there; the ten that only matter when you are arguing about
// something are one click away and remembered for the session.

const ADVANCED_KEY = "garden.scoreboard.advanced";

export default function Scoreboard({ initial }: { initial: Board }) {
  const { t } = useI18n();

  const [board, setBoard] = useState<Board>(initial);
  const [tab, setTab] = useState<string>(initial.defaultTab);
  const [advanced, setAdvanced] = useState(false);

  // A fresh server render replaces what is on screen.
  //
  // This is not belt and braces. The veto finishing flips the page to the match
  // view immediately and asks the server for a new render at the same moment,
  // so this component first mounts holding a board computed BEFORE the maps
  // existed — an empty one. Without this it would show "no map has been played"
  // until a poll happened to correct it.
  //
  // The dependency is the object identity, which only changes on a real server
  // render; a poll re-rendering the parent does not clobber the fresher board.
  useEffect(() => {
    setBoard(initial);
  }, [initial]);

  // Polling stops when the match does. Read off the board rather than a prop,
  // so the poll that reports the last round is also the one that ends the poll.
  const live = board.state !== "finished";

  // Read after mount rather than in the initialiser: localStorage does not
  // exist during the server render, and reading it in useState would make the
  // first client render disagree with the HTML that arrived.
  useEffect(() => {
    try {
      setAdvanced(window.localStorage.getItem(ADVANCED_KEY) === "1");
    } catch {
      // Private browsing, or a browser that refuses storage. The default is fine.
    }
  }, []);

  const toggleAdvanced = useCallback(() => {
    setAdvanced((on) => {
      try {
        window.localStorage.setItem(ADVANCED_KEY, on ? "0" : "1");
      } catch {
        // See above.
      }
      return !on;
    });
  }, []);

  useEffect(() => {
    if (!live) return;

    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/tournament/scoreboard?matchId=${initial.matchId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const fresh: Board = await res.json();
        if (alive) setBoard(fresh);
      } catch {
        // A dropped poll is a stale table, not a broken one. Saying so on screen
        // would be noisier than the fault.
      }
    };

    // Once immediately, because this component can mount holding a board that
    // was computed before the first map existed — see the sync above.
    load();

    // Five seconds. A round takes at least forty, so this is already faster
    // than the data can change, and a scoreboard is not a live score bar.
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [live, initial.matchId]);

  // A tab that disappears — the live map finishing and being replaced — must not
  // leave the table empty. Falling back to whatever the server now says is the
  // default keeps the view on something real.
  const activeTab = board.tabs.some((x) => x.key === tab) ? tab : board.defaultTab;

  const rows = board.rows[activeTab] ?? [];

  const sides = useMemo(
    () => ({
      a: rows.filter((r) => r.slot === "a"),
      b: rows.filter((r) => r.slot === "b"),
      none: rows.filter((r) => r.slot === null),
    }),
    [rows],
  );

  if (board.tabs.length === 0) {
    return <p className="muted">{t("scoreboard.nothingYet")}</p>;
  }

  return (
    <div className="sb">
      <div className="sb-head">
        <div className="sb-tabs" role="tablist" aria-label={t("scoreboard.tabsAria")}>
          {board.tabs.map((x) => (
            <button
              key={x.key}
              role="tab"
              aria-selected={x.key === activeTab}
              className={`sb-tab ${x.key === activeTab ? "on" : ""} ${x.live ? "live" : ""}`}
              onClick={() => setTab(x.key)}
            >
              <span className="sb-tab-name">
                {x.key === "series" ? t("scoreboard.series") : x.label}
              </span>

              {x.scoreA !== null && x.scoreB !== null && (
                <span className="sb-tab-score num">
                  {x.scoreA}–{x.scoreB}
                </span>
              )}

              {/* A word as well as the colour, because "live" as a red dot alone
                  is a state only sighted users in a light theme can read. */}
              {x.live && <span className="sb-tab-live">{t("scoreboard.live")}</span>}
            </button>
          ))}
        </div>

        <button
          className={`btn btn-secondary sb-adv ${advanced ? "on" : ""}`}
          aria-pressed={advanced}
          onClick={toggleAdvanced}
        >
          {t("scoreboard.advanced")}
        </button>
      </div>

      {/* The match's best player, once there is a match to judge. Above the
          tables rather than below them: it is the answer to the question the
          tables exist to support, and burying it under three scoreboards means
          nobody reads it. */}
      {board.mvp && (
        <MvpCard
          mvp={board.mvp}
          teamA={board.teamA?.name ?? t("match.tbd")}
          teamB={board.teamB?.name ?? t("match.tbd")}
          roleIcons={<RolePair roleT={board.mvp.roleT} roleCt={board.mvp.roleCt} />}
        />
      )}

      {rows.length === 0 ? (
        <p className="muted sb-empty">{t("scoreboard.noStats")}</p>
      ) : (
        <>
          <Side
            label={board.teamA?.name ?? t("match.tbd")}
            rows={sides.a}
            advanced={advanced}
            tone="a"
          />
          <Side
            label={board.teamB?.name ?? t("match.tbd")}
            rows={sides.b}
            advanced={advanced}
            tone="b"
          />

          {/* Anybody the roster could not account for. Should be nobody, and is
              shown rather than dropped when it is not: a player silently missing
              from a scoreboard is a much worse bug than an odd extra heading. */}
          {sides.none.length > 0 && (
            <Side
              label={t("scoreboard.unrostered")}
              rows={sides.none}
              advanced={advanced}
              tone="none"
            />
          )}
        </>
      )}
    </div>
  );
}

function Side({
  label,
  rows,
  advanced,
  tone,
}: {
  label: string;
  rows: ScoreboardRow[];
  advanced: boolean;
  tone: "a" | "b" | "none";
}) {
  const { t } = useI18n();

  if (rows.length === 0) return null;

  return (
    <section className={`sb-side sb-${tone}`}>
      <h4 className="sb-side-head">{label}</h4>

      {/* The table scrolls inside its wrapper rather than taking the page
          sideways with it, which is what the rest of the site does. */}
      <div className="pro-tablewrap">
        <table className="sb-table">
          <thead>
            <tr>
              <th className="sb-col-name">{t("tournaments.player")}</th>
              <th title={t("scoreboard.ratingHint")}>{t("tstats.rating")}</th>
              <th>{t("scoreboard.kda")}</th>
              <th>{t("tstats.kd")}</th>
              <th>{t("tstats.adr")}</th>
              <th>{t("tstats.kast")}</th>
              <th>{t("tstats.hs")}</th>

              {advanced && (
                <>
                  <th>{t("scoreboard.rounds")}</th>
                  <th title={t("scoreboard.entryHint")}>{t("tournaments.entries")}</th>
                  <th>{t("tstats.clutches")}</th>
                  <th title={t("scoreboard.utilityHint")}>{t("tstats.utility")}</th>
                  <th>{t("scoreboard.damage")}</th>
                  <th>{t("scoreboard.role")}</th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.steamId}>
                <td className="sb-col-name">
                  <a href={`/players/${r.steamId}`}>{r.name}</a>
                  {r.isBot && <span className="sb-bot">{t("scoreboard.bot")}</span>}
                </td>

                {/* The rating leads, in the accent, because it is the one figure
                    that answers "who played well" on its own. */}
                <td className={`num sb-rating ${r.ratingAvg >= 1 ? "good" : "poor"}`}>
                  {r.ratingAvg.toFixed(2)}
                </td>

                <td className="num">
                  {r.kills}–{r.deaths}–{r.assists}
                </td>
                <td className="num">{r.kd.toFixed(2)}</td>
                <td className="num">{r.adr}</td>
                <td className="num">{r.kast}%</td>
                <td className="num">{r.hs}%</td>

                {advanced && (
                  <>
                    <td className="num">{r.roundsPlayed}</td>
                    {/* Opening kills and opening deaths together. One without the
                        other flatters whoever takes no duels at all. */}
                    <td className="num">
                      {r.entryKills}–{r.entryDeaths}
                    </td>
                    <td className="num">{r.clutches}</td>
                    <td className="num">{r.utilityDamage}</td>
                    <td className="num">{r.damage}</td>
                    <td className="sb-role">
                      <RolePair roleT={r.roleT} roleCt={r.roleCt} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
