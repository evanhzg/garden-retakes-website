"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/I18nProvider";

// Recent form for one player in a lobby roster.
//
// Two densities of the same data. The row itself carries the two numbers people
// actually judge on — rating and the win/loss strip — because a roster is read
// at a glance while a timer runs. Everything else is one hover away, which is
// where the numbers that need a second of thought live.
//
// A session is a run of rounds with no half-hour gap in it, which is what a
// "game" means on a server that never stops. The card says so rather than
// leaving "last 10" to be read as ten rounds.

export type SessionSummary = {
  startedAt: string;
  endedAt: string;
  maps: string[];
  rounds: number;
  wins: number;
  losses: number;
  rating: number;
  won: boolean;
};

export type RecentForm = {
  steamId: string;
  rounds: number;
  sessions: SessionSummary[];
  kd: number;
  adr: number;
  hsPercent: number;
  kastPercent: number;
  winPercent: number;
  rating: number;
  openingWinPercent: number;
  multiKills: number;
  clutches: number;
  topMap: string | null;
};

/** Fetches form for a whole roster in one request. */
export function useRosterForm(steamIds: string[]) {
  const [forms, setForms] = useState<Record<string, RecentForm>>({});
  // Joined so the effect re-runs on membership change, not on array identity.
  const key = steamIds.filter((id) => /^\d{5,20}$/.test(id)).sort().join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/players/recent?ids=${key}`)
      .then((r) => (r.ok ? r.json() : { players: {} }))
      .then((d) => {
        if (!cancelled) setForms(d.players ?? {});
      })
      .catch(() => {
        /* a lobby without stats is still a lobby */
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return forms;
}

const ratingTone = (r: number) => (r >= 1.15 ? "good" : r >= 0.9 ? "mid" : "low");

const mapShort = (m: string) => m.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());

export function FormStrip({ sessions }: { sessions: SessionSummary[] }) {
  // Oldest on the left, so the strip reads left-to-right like a timeline.
  const shown = [...sessions].reverse();
  return (
    <span className="pf-strip" aria-hidden>
      {shown.map((s, i) => (
        <span key={i} className={`pf-pip ${s.won ? "w" : "l"}`} />
      ))}
    </span>
  );
}

/** The compact line that sits under a roster name. */
export function FormLine({ form }: { form: RecentForm | undefined }) {
  const { t } = useI18n();
  if (!form || form.rounds === 0) {
    return <span className="pf-line empty">{t("form.nogames")}</span>;
  }
  return (
    <span className="pf-line">
      <span className={`pf-rating ${ratingTone(form.rating)}`}>{form.rating.toFixed(2)}</span>
      <FormStrip sessions={form.sessions} />
    </span>
  );
}

/**
 * The full card, portalled to the body and positioned in viewport coordinates.
 *
 * Portalled because a roster column has its own scroll box, and an absolutely
 * positioned card inside it gets clipped by the first player it is opened on.
 */
export function FormCard({
  form,
  name,
  anchor,
  onClose,
}: {
  form: RecentForm | undefined;
  name: string;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const WIDTH = 300;
  const GAP = 10;

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const height = ref.current?.offsetHeight ?? 260;
    // Prefer the side with room; clamp so it never leaves the viewport on a
    // roster row near an edge.
    const wantLeft = anchor.right + GAP + WIDTH < window.innerWidth ? anchor.right + GAP : anchor.left - GAP - WIDTH;
    const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, wantLeft));
    const top = Math.max(8, Math.min(window.innerHeight - height - 8, anchor.top));
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      className="pf-card"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: WIDTH, visibility: pos ? "visible" : "hidden" }}
      onMouseLeave={onClose}
    >
      <header className="pf-card-head">
        <span className="pf-card-name">{name}</span>
        {form && form.rounds > 0 && (
          <span className={`pf-rating big ${ratingTone(form.rating)}`}>{form.rating.toFixed(2)}</span>
        )}
      </header>

      {!form || form.rounds === 0 ? (
        <p className="pf-card-empty">{t("form.nogamesLong")}</p>
      ) : (
        <>
          <p className="pf-card-sub">
            {t("form.window", { sessions: form.sessions.length, rounds: form.rounds })}
          </p>

          <FormStrip sessions={form.sessions} />

          <dl className="pf-stats">
            <div><dt>{t("form.kd")}</dt><dd>{form.kd.toFixed(2)}</dd></div>
            <div><dt>{t("form.adr")}</dt><dd>{form.adr.toFixed(0)}</dd></div>
            <div><dt>{t("form.hs")}</dt><dd>{form.hsPercent.toFixed(0)}%</dd></div>
            <div><dt>{t("form.kast")}</dt><dd>{form.kastPercent.toFixed(0)}%</dd></div>
            <div><dt>{t("form.winrate")}</dt><dd>{form.winPercent.toFixed(0)}%</dd></div>
            <div><dt>{t("form.opening")}</dt><dd>{form.openingWinPercent.toFixed(0)}%</dd></div>
            <div><dt>{t("form.multikills")}</dt><dd>{form.multiKills}</dd></div>
            <div><dt>{t("form.clutches")}</dt><dd>{form.clutches}</dd></div>
          </dl>

          {form.topMap && <p className="pf-card-map">{t("form.mostplayed", { map: mapShort(form.topMap) })}</p>}
        </>
      )}
    </div>,
    document.body
  );
}
