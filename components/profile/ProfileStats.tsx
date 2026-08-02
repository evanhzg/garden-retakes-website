"use client";

import { useState } from "react";
import FaceitPanel from "@/components/profile/FaceitPanel";
import ClipsPanel from "@/components/profile/ClipsPanel";

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

type Tab = "form" | "maps" | "sessions" | "clips" | "faceit" | "details";

const TABS: { id: Tab; label: string }[] = [
  { id: "form", label: "Form" },
  { id: "maps", label: "Maps" },
  { id: "sessions", label: "Sessions" },
  { id: "clips", label: "Clips" },
  { id: "faceit", label: "FACEIT" },
  { id: "details", label: "Details" },
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
  const [tab, setTab] = useState<Tab>("form");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const maxRecent = Math.max(1.5, ...recentRatings);

  return (
    <section className="pro-section">
      <div className="pro-tabs" role="tablist" aria-label="Profile statistics">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`pro-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`pro-panel-${t.id}`}
            className={`pro-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "sessions" && byDay.length > 0 && <span className="pro-tab-count">{byDay.length}</span>}
          </button>
        ))}
      </div>

      <div className="pro-panel" role="tabpanel" id={`pro-panel-${tab}`} aria-labelledby={`pro-tab-${tab}`}>
        {tab === "form" && <FormPanel total={total} bySide={bySide} recentRatings={recentRatings} maxRecent={maxRecent} />}
        {tab === "maps" && <MapsPanel byMap={byMap} />}
        {tab === "sessions" && <SessionsPanel byDay={byDay} openDay={openDay} setOpenDay={setOpenDay} />}
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
  const meters = [
    { label: "Round win", display: `${total.winPct.toFixed(0)}%`, pct: total.winPct },
    { label: "KAST", display: `${total.kast.toFixed(0)}%`, pct: total.kast },
    { label: "Headshots", display: `${total.hs.toFixed(0)}%`, pct: total.hs },
    { label: "ADR", display: total.adr.toFixed(0), pct: (total.adr / 150) * 100 },
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
          <span className="pro-section-note">Last {recentRatings.length} rounds — rating</span>
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
                {side === "T" ? "Terrorist — defense" : "Counter-Terrorist — retake"}
              </h3>
              <div className="pro-sidecard-stats">
                {[
                  { k: "Rating", v: summary.rating.toFixed(2), cls: ratingClass(summary.rating) },
                  { k: "K/D", v: summary.kd.toFixed(2) },
                  { k: "ADR", v: summary.adr.toFixed(0) },
                  { k: "Win %", v: `${summary.winPct.toFixed(0)}%`, sub: `${summary.rounds} rds` },
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
  if (byMap.length === 0) return <p className="empty-hint">Nothing yet.</p>;
  return (
    <div className="pro-tablewrap">
      <table className="table num">
        <thead>
          <tr>
            <th scope="col">Map</th>
            <th scope="col" className="r">Rounds</th>
            <th scope="col" className="r">Win %</th>
            <th scope="col" className="r">K — D</th>
            <th scope="col" className="r">ADR</th>
            <th scope="col" className="r">KAST</th>
            <th scope="col" className="r">Rating</th>
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
  if (byDay.length === 0) return <p className="empty-hint">Nothing yet.</p>;

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
                <span className="num">{s.rounds}</span> rds
              </span>
              <span className="pro-session-glance">
                <span className="num">{s.winPct.toFixed(0)}%</span> won
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
                    { k: "ADR", v: s.adr.toFixed(0) },
                    { k: "KAST", v: `${s.kast.toFixed(0)}%` },
                    { k: "HS %", v: `${s.hs.toFixed(0)}%` },
                    { k: "K/D", v: s.kd.toFixed(2) },
                    { k: "Kills / round", v: s.kpr.toFixed(2) },
                    { k: "Clutches", v: s.clutches },
                    { k: "Opening kills", v: s.openingKills, sub: `${s.openingDeaths} deaths` },
                    { k: "Multi-kills", v: s.multiKills },
                    { k: "Trade kills", v: s.tradeKills },
                    { k: "Util / round", v: s.utilPerRound.toFixed(1) },
                    { k: "Flashed", v: s.enemiesFlashed },
                    { k: "Plants / defuses", v: `${s.plants} / ${s.defuses}` },
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
                    <span className="pro-section-note">Maps that day</span>
                    <div className="pro-tablewrap">
                      <table className="table num">
                        <thead>
                          <tr>
                            <th scope="col">Map</th>
                            <th scope="col" className="r">Rounds</th>
                            <th scope="col" className="r">Win %</th>
                            <th scope="col" className="r">K — D</th>
                            <th scope="col" className="r">ADR</th>
                            <th scope="col" className="r">Rating</th>
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
  const details = [
    { v: total.openingKills, k: "Opening kills", sub: `${total.openingDeaths} opening deaths` },
    { v: total.clutches, k: "Clutches won" },
    { v: total.multiKills, k: "Multi-kill rounds" },
    { v: total.tradeKills, k: "Trade kills" },
    { v: total.utilPerRound.toFixed(1), k: "Util dmg / round" },
    { v: total.enemiesFlashed, k: "Enemies flashed" },
    { v: total.defuses, k: "Defuses", sub: `${total.plants} plants` },
    { v: total.kpr.toFixed(2), k: "Kills / round" },
    { v: total.assists, k: "Assists" },
    { v: total.wins, k: "Rounds won", sub: `of ${total.rounds}` },
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
