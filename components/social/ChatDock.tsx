"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, X } from "lucide-react";

import AvatarImage from "@/components/AvatarImage";
import { useI18n } from "@/components/I18nProvider";
import {
  MessageBody,
  RECONCILE_MS,
  TYPING_PING_MS,
  TYPING_TTL_MS,
  dayLabel,
  mergeMessages,
  sameDay,
  timeLabel,
  type Message,
} from "./chatShared";

type Props = {
  /** Who this dock is a conversation with. */
  friendId: string;
  name: string;
  avatarUrl?: string | null;
  isOnline: boolean;
  /** Me. */
  steamId: string | null;
  socket: any;
  /** Messages that arrived while this dock was folded or behind another. */
  unread: number;
  /** Called when the conversation becomes visible, so the count can be cleared. */
  onRead: () => void;
  onClose: () => void;
  /**
   * Narrow enough that only the avatar fits.
   *
   * Decided by the row rather than here: how much space this dock gets depends
   * on how many others there are, which is not something a dock can see.
   */
  compact: boolean;
  onInvite: (friendId: string) => void;
  onError: (message: string) => void;
};

/**
 * One conversation, in its own window at the bottom of the screen.
 *
 * Previously the panel held a single `activeDmUser` and one set of messages, so
 * opening a second conversation replaced the first — the thread you were in
 * simply vanished. Several docks at once means several message lists, and the
 * honest way to have several of anything in React is a component that owns one.
 *
 * So each dock does its own loading, its own socket filtering and its own
 * sending. The parent keeps only what is genuinely shared: which conversations
 * are open, and the unread counts, which have to survive a dock being closed.
 */
export default function ChatDock({
  friendId,
  name,
  avatarUrl,
  isOnline,
  steamId,
  socket,
  unread,
  onRead,
  onClose,
  compact,
  onInvite,
  onError,
}: Props) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [minimised, setMinimised] = useState(false);
  const [typing, setTyping] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Read inside the socket handler, which is registered once per dock. */
  const foldedRef = useRef(false);
  foldedRef.current = minimised || compact;

  const fetchMessages = useCallback(async () => {
    if (!steamId) return;
    try {
      const res = await fetch(`/api/messages?targetId=${friendId}`, {
        headers: { Authorization: `Bearer ${steamId}` },
      });
      if (!res.ok) return;
      const data: Message[] = await res.json();
      // Merged rather than replaced: a replace would drop an optimistic line
      // sent between the request going out and the response coming back.
      setMessages((prev) => mergeMessages(prev, data));
    } catch {
      /* the reconcile is best-effort by design */
    }
  }, [steamId, friendId]);

  // Opening the thread loads it once; after that the socket delivers.
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, RECONCILE_MS);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Visible means read. A dock that is folded away, or squeezed down to its
  // avatar, is not being looked at and keeps counting.
  useEffect(() => {
    if (!minimised && !compact) onRead();
  }, [minimised, compact, messages.length, onRead]);

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg: any) => {
      if (msg?.type !== "dm" && msg?.type !== "direct") return;
      const from = String(msg.from);
      const to = msg.to ? String(msg.to) : undefined;

      // Only this conversation. Every dock hears every message, so each one
      // has to recognise its own — mine to them, or theirs to me.
      const mine = steamId && from === steamId && to === friendId;
      const theirs = from === friendId;
      if (!mine && !theirs) return;

      const incoming: Message = {
        id: msg.id ?? `${from}-${msg.ts ?? Date.now()}`,
        from,
        to,
        content: String(msg.content ?? ""),
        ts: Number(msg.ts) || Date.now(),
      };

      setMessages((prev) => mergeMessages(prev, [incoming]));
      if (theirs) setTyping(false);
    };

    const onTyping = ({ from }: { from: string }) => {
      if (String(from) !== friendId) return;
      setTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), TYPING_TTL_MS);
    };

    socket.on("new_message", onNewMessage);
    socket.on("dm_typing", onTyping);
    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("dm_typing", onTyping);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [socket, friendId, steamId]);

  // Stick to the newest line.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing, minimised, compact]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || !steamId) return;
    setInput("");

    if (content.startsWith("/invite")) {
      onInvite(friendId);
      return;
    }

    // Drawn immediately under a temporary id, then reconciled with the row the
    // server actually wrote. Both copies carry the same id after that, so the
    // merge collapses them instead of showing the line twice.
    const tempId = `pending-${Date.now()}`;
    const optimistic: Message = { id: tempId, from: steamId, to: friendId, content, ts: Date.now(), pending: true };
    setMessages((prev) => mergeMessages(prev, [optimistic]));

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${steamId}` },
        body: JSON.stringify({ targetSteamId: friendId, content }),
      });
      if (!res.ok) throw new Error("send failed");
      // The mapped shape from lib/webMessage, not the ORM row. Reading `Id` and
      // `CreatedAtUtc` here was the other half of the same mismatch: even once
      // the route stopped 500ing, those field names would have been undefined
      // and every sent message would have kept its temporary id for ever.
      const data = await res.json();
      const id = data?.message?.id ?? tempId;
      const ts = typeof data?.message?.ts === "number" ? data.message.ts : optimistic.ts;

      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id, ts, pending: false } : m)));
      socket?.emit("send_message", { type: "dm", targetSteamId: friendId, content, id, ts });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
      onError("Message not sent — try again.");
    }
  };

  const onType = (value: string) => {
    setInput(value);
    if (!socket) return;
    const now = Date.now();
    // Throttled: a keystroke is not an event worth a packet.
    if (now - lastTypingSent.current < TYPING_PING_MS) return;
    lastTypingSent.current = now;
    socket.emit("dm_typing", { targetSteamId: friendId });
  };

  // Compact wins over the fold. There is no room for a header to be folded or
  // unfolded when the whole dock is an avatar.
  const folded = compact || minimised;

  return (
    /* It used to arrive on a CSS keyframe and leave instantly — the element was
       simply unmounted, so a closed conversation blinked out and the docks
       beside it jumped into the gap. AnimatePresence in the parent holds it
       long enough to leave the way it came. */
    <motion.div
      className={`dm-dock ${folded ? "minimised" : ""} ${compact ? "compact" : ""}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 14 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="dm-view">
        {/* The whole header toggles the dock, the way every chat card people
            already use behaves — but the buttons inside it stop the click, or
            closing a conversation would also collapse the one underneath. */}
        <div
          className="dm-header"
          role="button"
          tabIndex={0}
          title={compact ? name : undefined}
          onClick={() => {
            if (compact) {
              // Squeezed to an avatar, the only useful thing a click can mean
              // is "I want this one" — so it reads rather than folds.
              onRead();
              return;
            }
            setMinimised((v) => {
              if (v) onRead();
              return !v;
            });
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            if (compact) {
              onRead();
              return;
            }
            setMinimised((v) => {
              if (v) onRead();
              return !v;
            });
          }}
        >
          <span className="dm-header-avatar">
            <AvatarImage steamId={friendId} src={avatarUrl ?? undefined} alt="" />
            <i className={`status-dot ${isOnline ? "online" : "offline"}`} />
          </span>

          {/* Hidden by CSS when compact, not removed: taking it out of the tree
              would make every resize a remount and lose the scroll position. */}
          <div className="dm-header-info">
            <span className="dm-header-name">{name}</span>
            <span className={`dm-header-status ${isOnline ? "on" : ""}`}>
              {typing
                ? t("chat.typing")
                : isOnline
                  ? t("social.status.online")
                  : t("social.status.offline")}
            </span>
          </div>

          {/* What arrived while it was folded away, or while it was squeezed
              down to an avatar. The point of keeping a dock open rather than
              closing it is that the corner keeps counting. */}
          {folded && unread > 0 && <span className="dm-unread">{unread}</span>}

          <button
            className="dm-x"
            aria-label={t("common.close")}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Everything below the header folds.
            `height: auto` on the card could not animate — the CSS transitioned
            a value the browser will not interpolate, so the dock snapped shut.
            Framer measures the content and animates the real height.

            The composer goes with it, which is what makes a collapsed dock a
            title bar: a text box you cannot see the conversation above is an
            invitation to type into nothing. */}
        <AnimatePresence initial={false}>
          {!folded && (
            <motion.div
              className="dm-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="dm-messages" ref={logRef}>
                {messages.length === 0 && <div className="dm-empty">{t("chat.empty")}</div>}
                {messages.map((m, i) => {
                  const mine = m.from === steamId;
                  const prev = messages[i - 1];
                  const newDay = !prev || !sameDay(prev.ts, m.ts);
                  // A run from one person inside a couple of minutes is one
                  // block: repeating the avatar and the clock on every line
                  // turns a short exchange into a wall of chrome.
                  const grouped = !newDay && prev && prev.from === m.from && m.ts - prev.ts < 120_000;
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && <div className="dm-day">{dayLabel(m.ts)}</div>}
                      <div
                        className={[
                          "dm-msg",
                          mine ? "own" : "other",
                          m.isAdmin ? "staff" : "",
                          grouped ? "grouped" : "",
                          m.pending ? "pending" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <div className="dm-bubble">
                          <MessageBody content={m.content} />
                        </div>
                        {!grouped && <time className="dm-time">{timeLabel(m.ts)}</time>}
                      </div>
                    </React.Fragment>
                  );
                })}
                {typing && (
                  <div className="dm-msg other">
                    <div className="dm-bubble typing">
                      <i /><i /><i />
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={send} className="dm-input">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => onType(e.target.value)}
                  placeholder={t("chat.placeholder")}
                  maxLength={2000}
                />
                <button type="submit" disabled={!input.trim()} aria-label={t("chat.send")}>
                  <Send size={16} />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
