"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";
import "./rematch.css";

type Status = {
  available: boolean;
  reason: string | null;
  waitingOn: string[];
  accepted: string[];
  declined: string[];
  matchId: number | null;
  url: string | null;
};

/** Fast, because everybody is looking at it at the same moment. */
const POLL_MS = 2000;

/**
 * "Run it back."
 *
 * Shown on a finished match to the people who played it. The count is the
 * whole interface: a rematch needs everybody, so the useful thing to show is
 * how many are still deciding — not a spinner, and not a button that looks the
 * same before and after you press it.
 *
 * Polls rather than waiting on a socket. The socket carries lobby state, and
 * a match page that is open after the match has ended is not necessarily in a
 * lobby at all — somebody who has already left still gets a working page.
 */
export default function Rematch({ matchId }: { matchId: number }) {
  const { t } = useI18n();

  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Same guard as the veto board: a poll already in flight when somebody votes
   * would land afterwards carrying the state from before their click, and the
   * button would visibly un-press itself.
   */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const asked = generation.current;
    try {
      const res = await fetch(`/api/tournament/rematch?matchId=${matchId}`, { cache: "no-store" });
      if (!res.ok) return;
      const wire: Status = await res.json();
      if (generation.current !== asked) return;
      setStatus(wire);
    } catch {
      // A dropped poll is a stale count, not a broken offer.
    }
  }, [matchId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // The rematch exists: everybody goes, including whoever was not looking.
  useEffect(() => {
    if (status?.url) window.location.href = status.url;
  }, [status?.url]);

  const vote = async (accepted: boolean) => {
    generation.current += 1;
    const mine = generation.current;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/tournament/rematch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId, accepted }),
      });
      const data = await res.json();

      if (generation.current !== mine) return;

      if (data.error) {
        setError(data.error);
        return;
      }

      setStatus(data);
    } catch (err) {
      if (generation.current === mine) setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  // Nothing to say. Not an error state: most finished matches cannot be
  // rematched — a bracket match, a series, one already run back — and a
  // greyed-out button explaining that is worse than no button.
  if (!status || (!status.available && !status.url)) return null;

  const waiting = status.waitingOn.length;
  const said = status.accepted.length;
  const total = said + waiting;

  const declined = status.declined.length > 0;

  return (
    <div className="rm">
      <div className="rm-head">
        <RotateCcw size={14} />
        <span>{t("rematch.title")}</span>
      </div>

      {declined ? (
        <p className="rm-note">{t("rematch.declined")}</p>
      ) : (
        <>
          <p className="rm-note">
            {waiting === 0 ? t("rematch.starting") : t("rematch.waiting", { done: said, total })}
          </p>

          <div className="rm-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => vote(true)}>
              {t("rematch.yes")}
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => vote(false)}>
              {t("rematch.no")}
            </button>
          </div>

          {/* A bar rather than a list of names: the names are already down both
              sides of this page, and what anybody wants here is "how close". */}
          <div className="rm-bar" aria-hidden>
            <div
              className="rm-bar-fill"
              style={{ width: `${total === 0 ? 0 : (said / total) * 100}%` }}
            />
          </div>
        </>
      )}

      {error && <p className="rm-error">{error}</p>}
    </div>
  );
}
