"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Eye, ExternalLink, Copy, Check, Tv } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import StatusTag from "./StatusTag";
import type { BracketMatch } from "./Bracket";
import "./matchmodal.css";

// What a bracket box opens.
//
// It used to navigate straight to the match page, which is a whole page load
// away from the bracket somebody was reading — and on a phone, losing your
// place in a horizontally scrolled bracket to check one score is a bad trade.
// The modal answers the common question in place and keeps the full page one
// click further on for anybody who wants the veto board and the map table.

export type MatchDetail = {
  maps: { map: string; scoreA: number; scoreB: number; startSideTeamA: string | null }[];
  /** Set when the viewer may spectate and a server is assigned. */
  connect: string | null;
  /** The GOTV address, when the organizer has set one. */
  gotv: string | null;
  canSpectate: boolean;
  serverIsUp: boolean;
  state: string;
};

export default function MatchModal({
  match,
  slug,
  onClose,
}: {
  match: BracketMatch | null;
  slug: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [copied, setCopied] = useState(false);

  // Escape closes, and the page behind stops scrolling — the modal is fixed, so
  // without this the bracket scrolls under it while the modal stays put.
  useEffect(() => {
    if (!match) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const scroller = document.querySelector<HTMLElement>(".main-content");
    const previous = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = previous;
    };
  }, [match, onClose]);

  // Maps and the connect string are fetched rather than passed: the bracket
  // holds forty of these and pre-loading a connect string for every one of them
  // would ask the server for forty answers to a question nobody asked.
  useEffect(() => {
    if (!match) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setDetail(null);

    fetch(`/api/tournament/match?matchId=${match.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch(() => {
        // A failed detail fetch leaves the summary, which is most of the value.
      });

    return () => {
      cancelled = true;
    };
  }, [match]);

  if (!match || typeof document === "undefined") return null;

  const decided = match.winnerTeamId !== null;
  const aWon = decided && match.winnerTeamId === match.teamA?.id;
  const bWon = decided && match.winnerTeamId === match.teamB?.id;

  return createPortal(
    <div className="mm-backdrop" onClick={onClose} role="presentation">
      {/* Stops a click inside the card reaching the backdrop's close. */}
      <div
        className="mm-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${match.teamA?.name ?? "?"} versus ${match.teamB?.name ?? "?"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mm-head">
          <StatusTag kind="match" value={match.state} />
          <button className="mm-close" onClick={onClose} aria-label={t("commands.close")}>
            <X size={18} />
          </button>
        </header>

        <div className="mm-score">
          <div className={`mm-side ${aWon ? "won" : decided ? "lost" : ""}`}>
            <span className="mm-team">{match.teamA?.name ?? t("match.tbd")}</span>
            <span className="mm-num num">{decided || match.scoreA > 0 ? match.scoreA : "–"}</span>
          </div>

          <span className="mm-v">{match.bestOf > 1 ? `BO${match.bestOf}` : "v"}</span>

          <div className={`mm-side ${bWon ? "won" : decided ? "lost" : ""}`}>
            <span className="mm-num num">{decided || match.scoreB > 0 ? match.scoreB : "–"}</span>
            <span className="mm-team">{match.teamB?.name ?? t("match.tbd")}</span>
          </div>
        </div>

        {detail && detail.maps.length > 0 && (
          <ul className="mm-maps">
            {detail.maps.map((m, i) => (
              <li key={`${m.map}-${i}`}>
                <span className="mm-map">{m.map.replace(/^de_/, "")}</span>
                <span className="mm-map-score num">
                  {m.scoreA} – {m.scoreB}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mm-actions">
          {/* Only offered when there is genuinely something to watch and this
              viewer is allowed to. The server decides both; this only renders
              what it was told. */}
          {detail?.canSpectate && (detail.gotv || detail.connect) && (
            <>
              {/* Watching means GOTV. Handing a viewer the game server takes one
                  of its player slots for somebody who is not playing and drops
                  them into a live round; GOTV costs nothing and is already on.
                  The server address is the fallback for a tournament whose
                  organizer never set one, not the first offer. */}
              <a
                className="btn btn-primary mm-btn"
                href={`steam://connect/${detail.gotv ?? detail.connect}`}
              >
                <Tv size={15} />
                {detail.gotv ? t("match.watchGotv") : t("match.spectate")}
              </a>

              {/* The server itself, for anybody who actually needs to be in it.
                  Only when it is a different address from the one above. */}
              {detail.gotv && detail.connect && (
                <a className="btn btn-secondary mm-btn" href={`steam://connect/${detail.connect}`}>
                  <Eye size={15} />
                  {t("match.joinServer")}
                </a>
              )}

              <button
                className="btn mm-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(`connect ${detail.gotv ?? detail.connect}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? t("register.copied") : t("match.copyWatch")}
              </button>
            </>
          )}

          {/* Says why there is no button, rather than leaving a gap where one
              would be. "There is no server yet" and "you are not allowed to
              watch" are different answers and people deserve to know which. */}
          {detail && !detail.connect && !detail.gotv && detail.state !== "finished" && (
            <p className="mm-why">
              {detail.canSpectate ? t("match.noServerYet") : t("match.notAllowed")}
            </p>
          )}

          <Link className="btn mm-btn" href={`/tournaments/${slug}/match/${match.id}`}>
            <ExternalLink size={15} />
            {t("match.openPage")}
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
