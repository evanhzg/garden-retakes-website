"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import MatchAdmin from "./MatchAdmin";
import ServerConsole from "./ServerConsole";
import "./matchadminmodal.css";

// The match controls, on the match page.
//
// They already existed — every button in MatchAdmin sends a command the plugin
// accepts — but they lived only on the organizer's tournament page, which is
// the wrong place at the wrong time. The moment somebody needs to force a
// ready, restore a round or fix a score is the moment they are looking at the
// match; making them leave it, find the right card among sixteen and come back
// is friction paid exactly when there is least time for it.
//
// A modal rather than a panel because the page underneath is the thing being
// fixed: the scoreboard has to stay visible and keep polling behind it, and an
// inline panel would push the match off the screen every time it opened.

export default function MatchAdminModal({
  matchId,
  matchKey,
  teamA,
  teamB,
  state,
  adminKey,
  onClose,
}: {
  matchId: number;
  matchKey: string;
  teamA: string;
  teamB: string;
  state: string;
  adminKey?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();

  // Escape closes, and the page behind stops scrolling — the modal is fixed, so
  // without this the match scrolls under it while the modal stays put.
  useEffect(() => {
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
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="mam-backdrop" onClick={onClose} role="presentation">
      {/* Stops a click inside the card reaching the backdrop's close — which
          matters more here than usual, since the card is nothing but buttons. */}
      <div
        className="mam-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("matchAdmin.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mam-head">
          <h3>{t("matchAdmin.title")}</h3>
          <button className="mam-close" onClick={onClose} aria-label={t("commands.close")}>
            <X size={18} />
          </button>
        </header>

        <div className="mam-body">
          <MatchAdmin
            matchId={matchId}
            matchKey={matchKey}
            teamA={teamA}
            teamB={teamB}
            state={state}
            adminKey={adminKey}
          />

          {/* The console below the buttons, not instead of them. The buttons
              are the things anybody needs under pressure; the console is for
              the thing nobody anticipated, which is why it exists at all.
              Addressed by match rather than by server, so it cannot be pointed
              at a server this match is not on. */}
          <ServerConsole matchId={matchId} adminKey={adminKey} title={t("console.title")} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
