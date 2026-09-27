"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Database, Gamepad2, Globe, Radio, RefreshCw, Swords, Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { Health, StatusReport } from "@/lib/status";

const REFRESH_MS = 30_000;

const COMPONENT_ICON: Record<string, typeof Globe> = {
  website: Globe,
  database: Database,
  matchmaking: Radio,
};

function ago(iso: string, now: number, t: (k: string, v?: Record<string, string | number>) => string) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 5 ? t("status.justNow") : t("status.secondsAgo", { n: s });
}

/** The status board, refreshed in place. */
export default function StatusBoard({ initial }: { initial: StatusReport }) {
  const { t } = useI18n();
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const next = (await res.json()) as StatusReport;
      if (next && next.checkedAt) setReport(next);
    } catch {
      /* keep the last good report on screen */
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  const verdict: Record<Health, string> = {
    ok: t("status.verdict.ok"),
    degraded: t("status.verdict.degraded"),
    down: t("status.verdict.down"),
    unknown: t("status.verdict.unknown"),
  };
  const healthLabel: Record<Health, string> = {
    ok: t("status.h.ok"),
    degraded: t("status.h.degraded"),
    down: t("status.h.down"),
    unknown: t("status.h.unknown"),
  };

  const online = report.servers.reduce((n, s) => n + (s.live ? Math.max(0, s.live.players - s.live.bots) : 0), 0);

  return (
    <>
      <section className={`st-banner ${report.health}`} aria-live="polite">
        <span className="st-pulse" aria-hidden />
        <div className="st-banner-text">
          <strong>{verdict[report.health]}</strong>
          <span>
            {t("status.checked")} {ago(report.checkedAt, now, t)}
            {report.version && <> · {t("status.version")} <code className="num">{report.version}</code></>}
          </span>
        </div>
        <button className="btn btn-secondary st-refresh" onClick={refresh} disabled={busy}>
          <RefreshCw size={14} className={busy ? "st-spin" : ""} /> {t("status.refresh")}
        </button>
      </section>

      <div className="st-summary">
        <div>
          <span className="st-sum-label"><Users size={14} /> {t("status.online")}</span>
          <span className="st-sum-value num">{report.liveQueries ? online : "—"}</span>
        </div>
        <div>
          <span className="st-sum-label"><Gamepad2 size={14} /> {t("status.serversUp")}</span>
          <span className="st-sum-value num">
            {report.servers.filter((s) => s.health === "ok").length}/{report.servers.length}
          </span>
        </div>
        <div>
          <span className="st-sum-label"><Swords size={14} /> {t("status.matchesLive")}</span>
          <span className="st-sum-value num">{report.servers.filter((s) => s.match).length}</span>
        </div>
      </div>

      <section className="st-section">
        <h2>{t("status.platform")}</h2>
        <ul className="st-list">
          {report.components.map((c) => {
            const Icon = COMPONENT_ICON[c.id] ?? Activity;
            return (
              <li key={c.id} className={`st-row ${c.health}`}>
                <Icon size={16} className="st-row-icon" />
                <span className="st-row-name">{t(`status.c.${c.id}`)}</span>
                <span className="st-row-meta num">{c.latencyMs !== null ? `${c.latencyMs} ms` : ""}</span>
                <span className={`st-chip ${c.health}`}>{healthLabel[c.health]}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="st-section">
        <h2>{t("status.servers")}</h2>
        {!report.liveQueries && <p className="st-note">{t("status.noUdp")}</p>}
        <ul className="st-list">
          {report.servers.map((s) => (
            <li key={s.id} className={`st-row server ${s.health}`}>
              <Gamepad2 size={16} className="st-row-icon" />
              <span className="st-row-name">
                {s.name}
                <span className="st-row-sub">
                  <code className="num">{s.address}</code>
                  {s.kind === "public" && <span className="st-tag">{t("status.public")}</span>}
                </span>
              </span>
              <span className="st-row-live">
                {s.live ? (
                  <>
                    <span className="num">{Math.max(0, s.live.players - s.live.bots)}/{s.live.maxPlayers}</span>
                    <span className="st-map">{s.live.map.replace(/^(de|cs|ar)_/, "")}</span>
                    <span className="num st-dim">{s.live.latencyMs} ms</span>
                  </>
                ) : s.recorded ? (
                  <span className="st-dim">{t(`status.recorded.${s.recorded}`)}</span>
                ) : null}
                {s.match && (
                  <Link className="st-match" href={`/tournaments/${s.match.slug}/match/${s.match.id}`}>
                    <span className="st-live-dot" aria-hidden /> {s.match.label}
                  </Link>
                )}
              </span>
              <span className={`st-chip ${s.health}`}>{healthLabel[s.health]}</span>
              {s.health === "ok" && !s.match && (
                <a className="btn btn-ghost st-connect" href={`steam://connect/${s.address}`}>
                  {t("status.connect")}
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="st-foot">{t("status.foot", { s: REFRESH_MS / 1000 })}</p>
    </>
  );
}
