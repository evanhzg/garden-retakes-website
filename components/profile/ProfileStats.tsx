"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import FaceitPanel from "@/components/profile/FaceitPanel";
import ClipsPanel from "@/components/profile/ClipsPanel";
import TournamentPanel from "@/components/profile/TournamentPanel";

// The profile was one long column of eight stacked panels — you scrolled past
// per-side and per-map to reach anything. The same data now sits behind tabs,
// and the per-day table (which was the widest and least readable of them) is a
// session list where a row opens to show how that day actually went.

export type Summary = {
  rounds: number;
  wins: number;
  winPct: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  kpr: number;
  adr: number;
  kast: number;
  hs: number;
  rating: number;
  openingKills: number;
  openingDeaths: number;
  clutches: number;
  plants: number;
  defuses: number;
  multiKills: number;
  utilPerRound: number;
  enemiesFlashed: number;
  tradeKills: number;
};

export type DayEntry = {
  day: string;
  summary: Summary;
  maps: { map: string; summary: Summary }[];
};

type Tab = "form" | "maps" | "sessions" | "tournaments" | "clips" | "faceit" | "details";

const TABS: { id: Tab }[] = [
  { id: "form" },
  { id: "maps" },
  { id: "sessions" },
  { id: "tournaments" },
  { id: "clips" },
  { id: "faceit" },
  { id: "details" },
];

const ratingClass = (r: number) => (r >= 1.1 ? "rating-good" : r < 0.9 ? "rating-bad" : "rating-neutral");

const fmtDay = (day: string) => {
  const d = new Date(day);
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

export default function ProfileStats({
  steamId,
  signedIn = false,
  total,
  bySide,
  byMap,
  byDay,
  recentRatings,
}: {
  steamId: string;
  /** Enables liking and commenting on the Clips tab. */
  signedIn?: boolean;
  total: Summary;
  bySide: { side: string; summary: Summary }[];
  byMap: { map: string; summary: Summary }[];
  byDay: DayEntry[];
  recentRatings: number[];
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("form");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const maxRecent = Math.max(1.5, ...recentRatings);

  return (
    <section className="pro-section">
      <div className="pro-tabs" role="tablist" aria-label={t("profile.stats.ariaLabel")}>
        {TABS.map((tItem) => (
          <button
            key={tItem.id}
            role="tab"
            id={`pro-tab-${tItem.id}`}
            aria-selected={tab === tItem.id}
            aria-controls={`pro-panel-${tItem.id}`}
            className={`pro-tab ${tab === tItem.id ? "active" : ""}`}
            onClick={() => setTab(tItem.id)}
          >
            {t(`profile.stats.tabs.${tItem.id}`)}
            {tItem.id === "sessions" && byDay.length > 0 && <span className="pro-tab-count">{byDay.length}</span>}
          </button>
        ))}
      </div>

      <div className="pro-panel" role="tabpanel" id={`pro-panel-${tab}`} aria-labelledby={`pro-tab-${tab}`}>
        {tab === "form" && <FormPanel total={total} bySide={bySide} recentRatings={recentRatings} maxRecent={maxRecent} />}
        {tab === "maps" && <MapsPanel byMap={byMap} />}
        {tab === "sessions" && <SessionsPanel byDay={byDay} openDay={openDay} setOpenDay={setOpenDay} />}
        {tab === "tournaments" && <TournamentPanel steamId={steamId} />}
        {tab === "clips" && <ClipsPanel steamId={steamId} signedIn={signedIn} />}
        {tab === "faceit" && <FaceitPanel steamId={steamId} />}
        {tab === "details" && <DetailsPanel total={total} />}
      </div>
    </section>
  );
}

function FormPanel({
  total,
  bySide,
  recentRatings,
  maxRecent,
}: {
  total: Summary;
  bySide: { side: string; summary: Summary }[];
  recentRatings: number[];
  maxRecent: number;
}) {
  const { t } = useI18n();
  const meters = [
    { label: t("profile.stats.meters.roundWin"), display: `${total.winPct.toFixed(0)}%`, pct: total.winPct },
    { label: t("profile.stats.meters.kast"), display: `${total.kast.toFixed(0)}%`, pct: total.kast },
    { label: t("profile.stats.meters.headshots"), display: `${total.hs.toFixed(0)}%`, pct: total.hs },
    { label: t("profile.stats.meters.adr"), display: total.adr.toFixed(0), pct: (total.adr / 150) * 100 },
  ];

  return (
    <>
      <div className="pro-meters">
        {meters.map((m) => (
          <div key={m.label} className="pro-meter">
            <span className="pro-meter-k">{m.label}</span>
            <div className="pro-meter-track">
              <div className="pro-meter-fill" style={{ width: `${Math.min(100, Math.max(0, m.pct))}%` }} />
            </div>
            <span className="num pro-meter-v">{m.display}</span>
          </div>
        ))}
      </div>

      {recentRatings.length > 1 && (
        <div className="pro-spark-wrap">
          <span className="pro-section-note">{t("profile.stats.form.lastRounds", { count: recentRatings.length })}</span>
          <div className="pro-spark">
            {recentRatings.map((r, i) => (
              <span key={i} title={r.toFixed(2)} className={r >= 1 ? "up" : "down"} style={{ height: `${Math.max(6, (r / maxRecent) * 100)}%` }} />
            ))}
          </div>
        </div>
      )}

      {bySide.length > 0 && (
        <div className="pro-sidecards" style={{ marginTop: "var(--space-8)" }}>
          {bySide.map(({ side, summary }) => (
            <div key={side} className="pro-sidecard">
              <h3>
                <span className={`side-tag ${side === "T" ? "side-t" : "side-ct"}`}>{side}</span>
                {side === "T" ? t("profile.stats.form.sideT") : t("profile.stats.form.sideCt")}
              </h3>
              <div className="pro-sidecard-stats">
                {[
                  { k: t("profile.stats.table.rating"), v: summary.rating.toFixed(2), cls: ratingClass(summary.rating) },
                  { k: t("profile.stats.table.kd"), v: summary.kd.toFixed(2) },
                  { k: t("profile.stats.table.adr"), v: summary.adr.toFixed(0) },
                  { k: t("profile.stats.table.winPct"), v: `${summary.winPct.toFixed(0)}%`, sub: `${summary.rounds} ${t("profile.stats.sessions.rds")}` },
                ].map((c) => (
                  <div key={c.k}>
                    <span className={`num pro-stat-v ${c.cls ?? ""}`}>{c.v}</span>
                    <span className="pro-stat-k">{c.k}</span>
                    {c.sub && <span className="pro-stat-sub">{c.sub}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function MapsPanel({ byMap }: { byMap: { map: string; summary: Summary }[] }) {
  const { t } = useI18n();
  if (byMap.length === 0) return <p className="empty-hint">{t("profile.stats.empty")}</p>;
  return (
    <div className="pro-tablewrap">
      <table className="table num">
        <thead>
          <tr>
            <th scope="col">{t("profile.stats.table.map")}</th>
            <th scope="col" className="r">{t("profile.stats.table.rounds")}</th>
            <th scope="col" className="r">{t("profile.stats.table.winPct")}</th>
            <th scope="col" className="r">{t("profile.stats.table.kd")}</th>
            <th scope="col" className="r">{t("profile.stats.table.adr")}</th>
            <th scope="col" className="r">{t("profile.stats.table.kast")}</th>
            <th scope="col" className="r">{t("profile.stats.table.rating")}</th>
          </tr>
        </thead>
        <tbody>
          {byMap.map(({ map, summary: s }) => (
            <tr key={map}>
              <td style={{ fontWeight: 700 }}>{map}</td>
              <td className="r">{s.rounds}</td>
              <td className="r">{s.winPct.toFixed(0)}%</td>
              <td className="r">{s.kills} — {s.deaths}</td>
              <td className="r">{s.adr.toFixed(0)}</td>
              <td className="r">{s.kast.toFixed(0)}%</td>
              <td className={`r ${ratingClass(s.rating)}`} style={{ fontWeight: 800 }}>{s.rating.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One row per playing day; clicking opens the full breakdown for that day. */
function SessionsPanel({
  byDay,
  openDay,
  setOpenDay,
}: {
  byDay: DayEntry[];
  openDay: string | null;
  setOpenDay: (d: string | null) => void;
}) {
  const { t } = useI18n();
  if (byDay.length === 0) return <p className="empty-hint">{t("profile.stats.empty")}</p>;

  return (
    <ul className="pro-sessions">
      {byDay.map((entry) => {
        const open = openDay === entry.day;
        const s = entry.summary;
        return (
          <li key={entry.day} className={`pro-session ${open ? "open" : ""}`}>
            <button
              className="pro-session-head"
              aria-expanded={open}
              onClick={() => setOpenDay(open ? null : entry.day)}
            >
              <span className="pro-session-date">{fmtDay(entry.day)}</span>
              <span className="pro-session-glance">
                <span className="num">{s.rounds}</span> {t("profile.stats.sessions.rds")}
              </span>
              <span className="pro-session-glance">
                <span className="num">{s.winPct.toFixed(0)}%</span> {t("profile.stats.sessions.won")}
              </span>
              <span className="pro-session-glance">
                <span className="num">{s.kills}–{s.deaths}</span>
              </span>
              <span className={`num pro-session-rating ${ratingClass(s.rating)}`}>{s.rating.toFixed(2)}</span>
              <span className="pro-session-chevron" aria-hidden>{open ? "−" : "+"}</span>
            </button>

            {open && (
              <div className="pro-session-body">
                <div className="pro-session-grid">
                  {[
                    { k: t("profile.stats.table.adr"), v: s.adr.toFixed(0) },
                    { k: t("profile.stats.table.kast"), v: `${s.kast.toFixed(0)}%` },
                    { k: t("profile.stats.sessions.hs"), v: `${s.hs.toFixed(0)}%` },
                    { k: t("profile.stats.table.kd"), v: s.kd.toFixed(2) },
                    { k: t("profile.stats.sessions.kpr"), v: s.kpr.toFixed(2) },
                    { k: t("profile.stats.sessions.clutches"), v: s.clutches },
                    { k: t("profile.stats.sessions.openingKills"), v: s.openingKills, sub: `${s.openingDeaths} ${t("profile.stats.sessions.deaths")}` },
                    { k: t("profile.stats.sessions.multiKills"), v: s.multiKills },
                    { k: t("profile.stats.sessions.tradeKills"), v: s.tradeKills },
                    { k: t("profile.stats.sessions.utilPerRound"), v: s.utilPerRound.toFixed(1) },
                    { k: t("profile.stats.sessions.flashed"), v: s.enemiesFlashed },
                    { k: t("profile.stats.sessions.plantsDefuses"), v: `${s.plants} / ${s.defuses}` },
                  ].map((c) => (
                    <div key={c.k} className="pro-stat">
                      <span className="num pro-stat-v small">{c.v}</span>
                      <span className="pro-stat-k">{c.k}</span>
                      {c.sub && <span className="pro-stat-sub">{c.sub}</span>}
                    </div>
                  ))}
                </div>

                {entry.maps.length > 0 && (
                  <div className="pro-session-maps">
                    <span className="pro-section-note">{t("profile.stats.sessions.mapsThatDay")}</span>
                    <div className="pro-tablewrap">
                      <table className="table num">
                        <thead>
                          <tr>
                            <th scope="col">{t("profile.stats.table.map")}</th>
                            <th scope="col" className="r">{t("profile.stats.table.rounds")}</th>
                            <th scope="col" className="r">{t("profile.stats.table.winPct")}</th>
                            <th scope="col" className="r">{t("profile.stats.table.kd")}</th>
                            <th scope="col" className="r">{t("profile.stats.table.adr")}</th>
                            <th scope="col" className="r">{t("profile.stats.table.rating")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.maps.map((m) => (
                            <tr key={m.map}>
                              <td style={{ fontWeight: 700 }}>{m.map}</td>
                              <td className="r">{m.summary.rounds}</td>
                              <td className="r">{m.summary.winPct.toFixed(0)}%</td>
                              <td className="r">{m.summary.kills} — {m.summary.deaths}</td>
                              <td className="r">{m.summary.adr.toFixed(0)}</td>
                              <td className={`r ${ratingClass(m.summary.rating)}`} style={{ fontWeight: 800 }}>
                                {m.summary.rating.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DetailsPanel({ total }: { total: Summary }) {
  const { t } = useI18n();
  const details = [
    { v: total.openingKills, k: t("profile.stats.details.openingKills"), sub: `${total.openingDeaths} ${t("profile.stats.details.openingDeaths")}` },
    { v: total.clutches, k: t("profile.stats.details.clutchesWon") },
    { v: total.multiKills, k: t("profile.stats.details.multiKillRounds") },
    { v: total.tradeKills, k: t("profile.stats.sessions.tradeKills") },
    { v: total.utilPerRound.toFixed(1), k: t("profile.stats.details.utilDmg") },
    { v: total.enemiesFlashed, k: t("profile.stats.details.enemiesFlashed") },
    { v: total.defuses, k: t("profile.stats.details.defuses"), sub: `${total.plants} ${t("profile.stats.details.plants")}` },
    { v: total.kpr.toFixed(2), k: t("profile.stats.sessions.kpr") },
    { v: total.assists, k: t("profile.stats.details.assists") },
    { v: total.wins, k: t("profile.stats.details.roundsWon"), sub: t("profile.stats.details.ofRounds", { count: total.rounds }) },
  ];
  return (
    <div className="pro-details">
      {details.map((d) => (
        <div key={d.k} className="pro-stat">
          <span className="num pro-stat-v">{d.v}</span>
          <span className="pro-stat-k">{d.k}</span>
          {d.sub && <span className="pro-stat-sub">{d.sub}</span>}
        </div>
      ))}
    </div>
  );
}
