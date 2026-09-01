"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import AvatarStatus from "@/components/social/AvatarStatus";
import { useLivePlayers, gameStateOf } from "@/components/social/useLivePlayers";
import { shownPresence, type ChosenStatus } from "@/lib/presence";
import { ExternalLink, Flag, MessageSquare, UserMinus, UserPlus } from "lucide-react";
import { useSocket } from "@/components/SocketProvider";
import { useI18n } from '@/components/I18nProvider';
import "./playerbubble.css";

interface PlayerBubbleProps {
  steamId: string;
  name: string;
  isFriend?: boolean;
  /** Whether they have a tab open. See the note by gameState below. */
  isOnline?: boolean;
  /**
   * Open a conversation with this player.
   *
   * Optional, because the card is also opened from a leaderboard row where
   * there is no chat to open — the button is simply not drawn there rather
   * than drawn and inert.
   */
  onMessage?: (steamId: string) => void;
  children: React.ReactNode;
}

export default function PlayerBubble({ steamId, name, isFriend = false, isOnline = false, onMessage, children }: PlayerBubbleProps) {
    const { t } = useI18n();
  /**
   * Who is reading.
   *
   * The card offered "Add friend" on every card including your own — and the
   * POST behind it answers "Cannot add yourself", so the one thing the button
   * could do on that card was fail. It also offered it to people who already
   * were friends, where the answer is "Friendship already exists".
   */
  const { steamId: mySteamId } = useSocket();
  const isMe = Boolean(mySteamId) && mySteamId === steamId;

  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  /** In flight, so a second click cannot send a second request. */
  const [busy, setBusy] = useState(false);
  /** The one line of feedback an action gets. Cleared when the card closes. */
  const [notice, setNotice] = useState<string | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const livePlayers = useLivePlayers();

  /**
   * Whether they have a tab open, passed in rather than looked up.
   *
   * The socket context does not carry the online list — FriendsSidebar
   * subscribes to the events and keeps it — so the caller that already knows
   * says so. A leaderboard row, which does not, leaves it false and the card
   * falls back to the game feed, which is the only thing that page knows too.
   */
  const gameState = gameStateOf(steamId, livePlayers);

  // The bubble is portalled to <body> and positioned in viewport coordinates.
  // It used to be position:absolute/bottom:100% inside the row, which meant two
  // things: it always opened upward, and any ancestor with overflow (the app
  // shell's scroll container) clipped it — so rows near the top of the list had
  // their preview cut off.
  const WIDTH = 320;
  const GAP = 12;
  const [pos, setPos] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimated = popoverRef.current?.offsetHeight ?? 320;

    // Placed against the trigger, not against an assumed 330px sidebar.
    // The old line was `innerWidth - 330 - WIDTH - GAP`, which only lands
    // correctly for a row inside the expanded friends panel; opened from the
    // collapsed rail — or from a leaderboard row mid-page — it left the bubble
    // floating a sidebar's width away from whatever was clicked.
    let left = r.left - WIDTH - GAP;
    // No room on the left (trigger near the left edge): flip to the right.
    if (left < GAP) left = Math.min(r.right + GAP, window.innerWidth - WIDTH - GAP);
    left = Math.max(GAP, left);

    // Vertically align with the trigger, keeping it within bounds
    let top = r.top + r.height / 2 - estimated / 2;
    top = Math.max(GAP, Math.min(top, window.innerHeight - estimated - GAP));

    setPos({ left, top, placement: "above" });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    place();
    // Re-place on anything that moves the trigger. Capture catches scrolls in
    // the inner scroll container, not just the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [isOpen, place, data]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setNotice(null);
      setArmed(false);
    }

    if (nextOpen && !data && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/${steamId}`);
        if (res.ok) {
          const profileData = await res.json();
          setData(profileData);
        }
      } catch (err) {
        console.error("Error fetching profile", err);
      } finally {
        setLoading(false);
      }
    }
  };

  /**
   * Add friend, through the endpoint that exists.
   *
   * It emitted a `friend_request` socket event, and neither server.js nor
   * scripts/ has ever had a handler for that name — so the button opened, the
   * bubble closed, and nothing happened. /api/friends POST is the path the
   * rest of the site uses and the one with the duplicate and self-add checks
   * on it.
   */
  const handleAddFriend = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetSteamId: steamId }),
      });
      const json = await res.json().catch(() => ({}));
      setNotice(res.ok ? t("bubble.requestSent") : (json.error ?? t("bubble.requestFailed")));
    } catch {
      setNotice(t("bubble.requestFailed"));
    } finally {
      setBusy(false);
    }
  }, [steamId, t]);

  /**
   * Leave a friendship.
   *
   * Two presses rather than one: unfriending is not undoable from here — the
   * way back is a new request and their acceptance — and it sits in a row of
   * icon buttons where the neighbouring one opens a conversation. The first
   * press arms it, the second does it, and it disarms itself if the card is
   * closed.
   */
  const [armed, setArmed] = useState(false);

  const handleRemoveFriend = useCallback(async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetSteamId: steamId }),
      });
      setNotice(res.ok ? t("bubble.removed") : t("bubble.removeFailed"));
      if (res.ok) setArmed(false);
    } catch {
      setNotice(t("bubble.removeFailed"));
    } finally {
      setBusy(false);
    }
  }, [armed, steamId, t]);

  /**
   * Report, which files an actual ticket.
   *
   * This was `alert('Reported!')` — a browser dialog claiming a report had
   * been made, with nothing behind it. Anybody who used it believed staff had
   * been told. /api/tickets is the queue the admin panel reads, so a report
   * now lands somewhere a human looks.
   */
  const handleReport = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: "REPORT",
          message: `Report against ${name} (${steamId}) from their player card.`,
        }),
      });
      setNotice(res.ok ? t("bubble.reported") : t("bubble.reportFailed"));
    } catch {
      setNotice(t("bubble.reportFailed"));
    } finally {
      setBusy(false);
    }
  }, [steamId, name, t]);

  const shown = shownPresence({
    connected: isOnline,
    inGame: gameState,
    chosen: (data?.presence ?? null) as ChosenStatus,
  });

  return (
    <div className="pb-anchor">
      <div ref={triggerRef} onClick={handleToggle} className="pb-trigger">
        {children}
      </div>

      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoverRef}
            className="player-bubble pb"
            initial={{ opacity: 0, scale: 0.96, x: 6 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.97, x: 4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            <header className="pb-head">
              <AvatarStatus
                steamId={steamId}
                name={name}
                presence={shown}
                size={44}
              />

              <div className="pb-id">
                <span className="pb-name">{data?.name || name}</span>
                {/* What they are doing, then where they are from. The first is
                    why somebody opened this card; the second used to be the
                    only line and read "Steam User" for nearly everybody. */}
                <span className="pb-sub">
                  <span className={`pb-state is-${shown}`}>{t(`social.presence.${shown}`)}</span>
                  {shown === "offline" && data?.lastSeen && (
                    <span className="pb-seen">· {agoLabel(data.lastSeen)}</span>
                  )}
                  {data?.country && <span className="pb-country">· {data.country}</span>}
                </span>
              </div>

              {data?.isPro && <span className="pb-pro">{t("bubble.pro")}</span>}
            </header>

            <div className="pb-body">
              {loading ? (
                <p className="pb-loading">{t("auto.playerbubble.loading")}</p>
              ) : (
                <>
                  {data?.bio && <p className="pb-bio">{data.bio}</p>}

                  {/* Three, not two. Rounds is what makes the other two
                      readable — a 1.4 rating over 40 rounds and over 4000 are
                      different claims, and the card showed no way to tell. */}
                  <div className="pb-stats">
                    <div className="pb-stat">
                      <span className="pb-stat-k">{t("auto.playerbubble.rating")}</span>
                      <span className="pb-stat-v num">{data?.rating?.toFixed(2) ?? "—"}</span>
                    </div>
                    <div className="pb-stat">
                      <span className="pb-stat-k">{t("auto.playerbubble.win")}</span>
                      <span className="pb-stat-v num">
                        {typeof data?.winPct === "number" ? `${data.winPct.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                    <div className="pb-stat">
                      <span className="pb-stat-k">{t("bubble.rounds")}</span>
                      <span className="pb-stat-v num">
                        {typeof data?.rounds === "number" ? compactNumber(data.rounds) : "—"}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {notice && <p className="pb-notice">{notice}</p>}
            </div>

            <footer className="pb-foot">
              {/* The reason most cards are opened, and it was not on here. */}
              {onMessage && (
                <button
                  className="pb-act primary"
                  disabled={busy}
                  onClick={() => {
                    onMessage(steamId);
                    setIsOpen(false);
                  }}
                >
                  <MessageSquare size={15} />
                  <span>{t("bubble.message")}</span>
                </button>
              )}

              <Link href={`/players/${steamId}`} className="pb-act">
                <ExternalLink size={15} />
                <span>{t("auto.playerbubble.view_profile")}</span>
              </Link>

              {/* Not on your own card: the endpoint refuses it, so the
                  button could only ever fail. */}
              {!isFriend && !isMe && (
                <button
                  className="pb-act"
                  disabled={busy}
                  onClick={handleAddFriend}
                  title={t("auto.playerbubble.add_friend")}
                >
                  <UserPlus size={15} />
                </button>
              )}

              {isFriend && !isMe && (
                <button
                  className={`pb-act ${armed ? "danger is-armed" : ""}`}
                  disabled={busy}
                  onClick={handleRemoveFriend}
                  title={armed ? t("bubble.removeConfirm") : t("bubble.remove")}
                >
                  <UserMinus size={15} />
                  {armed && <span>{t("bubble.removeConfirm")}</span>}
                </button>
              )}

              {/* Reporting yourself is not a thing. */}
              {!isMe && (
                <button
                  className="pb-act danger"
                  disabled={busy}
                  onClick={handleReport}
                  title={t("auto.playerbubble.report_player")}
                >
                  <Flag size={15} />
                </button>
              )}
            </footer>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
}

/** "3 days ago", in the reader's language, without a countdown that ticks. */
function agoLabel(epochMs: number): string {
  const days = Math.round((epochMs - Date.now()) / 86_400_000);
  const rel = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(days) >= 1) return rel.format(days, "day");

  const hours = Math.round((epochMs - Date.now()) / 3_600_000);
  return Math.abs(hours) >= 1 ? rel.format(hours, "hour") : rel.format(0, "hour");
}

/** 4200 -> "4.2k". A five-digit round count in a 44px column wraps. */
function compactNumber(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
