"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Gamepad2, MessageSquare, X } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";
import { useSocket } from "@/components/SocketProvider";
import "./adminalerts.css";

type Alert = {
  id: number;
  source: string;
  matchId: number | null;
  matchKey: string;
  slug: string | null;
  map: string | null;
  steamId: string;
  name: string | null;
  team: string | null;
  score: string | null;
  reason: string | null;
  at: string;
  ackedAt: string | null;
};

/**
 * A fallback for when the poll is the only thing working.
 *
 * The socket delivers an alert the moment it is raised; this exists so an
 * organizer whose socket dropped still finds out, eventually, rather than
 * sitting in front of a page that looks calm while somebody waits in a paused
 * server.
 */
const POLL_MS = 20_000;

/**
 * Admin alerts for one tournament.
 *
 * Scoped to the tournament rather than site-wide, because that is the unit an
 * organizer runs. It renders nothing at all for anybody who cannot manage this
 * tournament — the API answers `canManage: false` and the bell never appears,
 * so the check is on the server and the component just believes it.
 */
export default function AdminAlerts({ tournamentId }: { tournamentId: number }) {
  const { t } = useI18n();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [recent, setRecent] = useState<Alert[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [open, setOpen] = useState(false);

  /** The newest id already seen, so the sound fires for new calls only. */
  const seen = useRef<number>(0);
  const primed = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournament/alert?tournamentId=${tournamentId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const data: { canManage: boolean; alerts?: Alert[]; recent?: Alert[] } = await res.json();
      setCanManage(Boolean(data.canManage));
      setAlerts(data.alerts ?? []);
      setRecent(data.recent ?? []);

      const newest = (data.alerts ?? []).reduce((n, a) => Math.max(n, a.id), 0);

      // The first load never rings. Opening a page to a fortnight of history
      // playing a chime is how somebody turns the sound off for good.
      if (!primed.current) {
        primed.current = true;
        seen.current = newest;
        return;
      }

      if (newest > seen.current) {
        seen.current = newest;
        chime();
      }
    } catch {
      // A dropped poll is a stale list, not a broken one.
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // The fast path. The poll above is the safety net.
  useEffect(() => {
    if (!socket) return;
    const onAlert = (a: { tournamentId?: number }) => {
      if (a?.tournamentId && a.tournamentId !== tournamentId) return;
      load();
    };
    socket.on("t:alert", onAlert);
    socket.on("t:alert:acked", onAlert);
    return () => {
      socket.off("t:alert", onAlert);
      socket.off("t:alert:acked", onAlert);
    };
  }, [socket, tournamentId, load]);

  const ack = async (id: number) => {
    // Removed first, restored by the next load if the server disagrees. An
    // organizer taking a call wants the list to shorten as they work through
    // it, not to wait a round trip per item.
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch("/api/tournament/alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ack", alertId: id }),
      });
    } finally {
      load();
    }
  };

  if (!canManage) return null;

  const count = alerts.length;

  return (
    <>
      <button
        className={`aa-bell ${count > 0 ? "has" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={t("alerts.title")}
        title={t("alerts.title")}
      >
        <Bell size={16} />
        {count > 0 && <span className="aa-count">{count}</span>}
      </button>

      {/* The preview: the newest open call, in the page rather than behind a
          click. A bell with a number on it tells an organizer that something
          happened; this tells them what, which is the difference between
          checking and reacting. */}
      <AnimatePresence>
        {count > 0 && !open && (
          <motion.button
            className="aa-peek"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <SourceIcon source={alerts[0].source} />
            <span className="aa-peek-text">
              <b>{alerts[0].name ?? alerts[0].steamId}</b>{" "}
              {t(alerts[0].source === "game" ? "alerts.fromGame" : "alerts.fromChat")}
            </span>
            {count > 1 && <span className="aa-peek-more">+{count - 1}</span>}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            className="aa-backdrop"
            onClick={() => setOpen(false)}
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="aa-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={t("alerts.title")}
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className="aa-head">
                <h3>{t("alerts.title")}</h3>
                <button className="aa-x" onClick={() => setOpen(false)} aria-label={t("commands.close")}>
                  <X size={16} />
                </button>
              </header>

              <div className="aa-body">
                {alerts.length === 0 && recent.length === 0 && (
                  <p className="aa-none">{t("alerts.none")}</p>
                )}

                {alerts.map((a) => (
                  <Row key={a.id} alert={a} onAck={() => ack(a.id)} t={t} />
                ))}

                {recent.length > 0 && (
                  <>
                    <h4 className="aa-sub">{t("alerts.handled")}</h4>
                    {recent.map((a) => (
                      <Row key={a.id} alert={a} done t={t} />
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Where the call came from, which decides how urgent it is. */
function SourceIcon({ source }: { source: string }) {
  return source === "game" ? (
    <Gamepad2 size={14} className="aa-src aa-src-game" />
  ) : (
    <MessageSquare size={14} className="aa-src aa-src-chat" />
  );
}

function Row({
  alert,
  onAck,
  done,
  t,
}: {
  alert: Alert;
  onAck?: () => void;
  done?: boolean;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const href = alert.slug && alert.matchId
    ? `/tournaments/${alert.slug}/match/${alert.matchId}`
    : null;

  return (
    <div className={`aa-row ${done ? "done" : ""} src-${alert.source}`}>
      <SourceIcon source={alert.source} />

      <div className="aa-main">
        <div className="aa-who">
          <b>{alert.name ?? alert.steamId}</b>
          {alert.team && <span className="aa-team">{alert.team}</span>}
          <span className="aa-where">
            {t(alert.source === "game" ? "alerts.fromGame" : "alerts.fromChat")}
          </span>
        </div>

        {(alert.map || alert.score) && (
          <div className="aa-meta">
            {alert.map}
            {alert.score ? ` · ${alert.score}` : ""}
          </div>
        )}

        {alert.reason && <div className="aa-reason">{alert.reason}</div>}
      </div>

      <div className="aa-actions">
        {href && (
          <Link className="aa-go" href={href}>
            {alert.matchId ? `#${alert.matchId}` : t("alerts.open")}
          </Link>
        )}
        {!done && onAck && (
          <button className="aa-ack" onClick={onAck}>
            {t("alerts.ack")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The sound.
 *
 * Synthesised rather than a file: an organizer is the only person who ever
 * hears it, so shipping an asset — and a CSP exception for it — to everybody
 * for a two-note chime is a poor trade. Two short tones, the second higher, in
 * a shape that reads as "something wants you" rather than as an error.
 *
 * Everything is wrapped: a browser that has not been interacted with refuses to
 * make noise, and a refusal must not take the alert down with it.
 */
function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const at = ctx.currentTime;

    // Indexed rather than .entries(): this target does not downlevel iterators,
    // and a chime is not worth a compiler flag.
    const notes = [880, 1320];
    for (let i = 0; i < notes.length; i++) {
      const freq = notes[i];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const start = at + i * 0.13;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    }

    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // A page that may not make noise is not a page that has failed.
  }
}
