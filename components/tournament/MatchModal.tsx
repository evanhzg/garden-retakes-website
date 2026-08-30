"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Eye, ExternalLink, Copy, Check, Tv } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import StatusTag from "./StatusTag";
import type { BracketMatch } from "./Bracket";
import "./matchmodal.css";

/**
 * A steam:// link that actually launches something.
 *
 * `steam://connect/host:port` names an address and no game, so Steam has to
 * guess the title by querying the server — and when that fails the link does
 * nothing at all, silently. `rungameid/730` says Counter-Strike 2 outright.
 */
const steamConnect = (address: string) =>
  `steam://rungameid/730//+connect%20${encodeURIComponent(address)}`;

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
          {/* First, and always rendered.

              This used to be last, after everything that depends on the detail
              fetch — so the one button that is always there, and the one people
              actually aim for, moved down the card a moment after opening as
              the watch buttons appeared above it. Clicking where it was and
              landing on "Watch" is the specific failure that fixes.

              Nothing below it can move it now: things are added underneath. */}
          <Link className="btn mm-btn" href={`/tournaments/${slug}/match/${match.id}`}>
            <ExternalLink size={15} />
            {t("match.openPage")}
          </Link>

          {/* And a placeholder for what is still loading, so the card does not
              grow under the cursor either.

              Only when there is something to wait FOR. A match nobody has
              played has no server and never will have one until it starts, so
              reserving space for buttons that are not coming is a hole in the
              card rather than a promise. */}
          {!detail && (match.state === "live" || match.state === "finished") && (
            <span className="mm-skeleton" aria-hidden="true">
              <span />
              <span />
            </span>
          )}

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
                href={steamConnect(detail.gotv ?? detail.connect!)}
              >
                <Tv size={15} />
                {detail.gotv ? t("match.watchGotv") : t("match.spectate")}
              </a>

              {/* The server itself, for anybody who actually needs to be in it.
                  Only when it is a different address from the one above. */}
              {detail.gotv && detail.connect && (
                <a className="btn btn-secondary mm-btn" href={steamConnect(detail.connect)}>
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

        </div>
      </div>
    </div>,
    document.body,
  );
}
