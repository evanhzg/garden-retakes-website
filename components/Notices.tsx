"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";
import "./notices.css";

/**
 * The notification stack, top right.
 *
 * Everything transient the site wants to say — an admin alert, the match server
 * coming up, a command that failed — arrives here rather than in whatever
 * inline banner each page invented for itself. Those banners all had the same
 * two problems: they pushed the layout down when they appeared, and a second
 * one replaced the first, so two things happening at once meant seeing one of
 * them.
 *
 * Four at a time. Beyond that the oldest leaves, because a stack that grows
 * without bound covers the thing it is describing, and the fifth notification
 * is never more important than the page underneath it. Four is the most that
 * fits above the fold on a laptop with room left to read.
 *
 * A notice does not auto-expire while the pointer is over it: the one time
 * somebody is reading one carefully is the one time it must not vanish
 * mid-sentence.
 */

export type NoticeKind = "info" | "ok" | "warn" | "busy";

export type Notice = {
  id: number;
  kind: NoticeKind;
  title: string;
  body?: string;
  /** Milliseconds on screen. 0 keeps it until something removes it. */
  ms: number;
  href?: string;
  /**
   * A stable name, so a repeated event replaces its predecessor instead of
   * stacking four copies of itself. The socket reconnecting twice is one
   * situation, not two notifications.
   */
  tag?: string;
};

type Api = {
  push: (notice: Omit<Notice, "id">) => number;
  dismiss: (id: number) => void;
  /** Removes whatever is holding a tag, for a state that has ended. */
  clearTag: (tag: string) => void;
};

const NoticeContext = createContext<Api>({ push: () => 0, dismiss: () => {}, clearTag: () => {} });

export const useNotices = () => useContext(NoticeContext);

const MAX = 4;

export default function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setNotices((list) => list.filter((t) => t.id !== id));
  }, []);

  const clearTag = useCallback((tag: string) => {
    setNotices((list) => list.filter((t) => t.tag !== tag));
  }, []);

  const push = useCallback((notice: Omit<Notice, "id">) => {
    const id = nextId.current++;

    setNotices((list) => {
      // A tag replaces rather than adds. Without it a flapping connection
      // produces a column of identical notices and pushes everything else out.
      const without = notice.tag ? list.filter((t) => t.tag !== notice.tag) : list;
      const next = [...without, { ...notice, id }];

      // Oldest first, so the one that leaves is the one that has been read.
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    });

    return id;
  }, []);

  const api = useMemo(() => ({ push, dismiss, clearTag }), [push, dismiss, clearTag]);

  return (
    <NoticeContext.Provider value={api}>
      {children}

      <div className="tst" role="region" aria-label="Notifications" aria-live="polite">
        <AnimatePresence initial={false}>
          {notices.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} onDismiss={() => dismiss(notice.id)} />
          ))}
        </AnimatePresence>
      </div>
    </NoticeContext.Provider>
  );
}

const ICONS: Record<NoticeKind, typeof Info> = {
  info: Info,
  ok: Check,
  warn: AlertTriangle,
  busy: Loader2,
};

function NoticeCard({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [held, setHeld] = useState(false);
  const Icon = ICONS[notice.kind];

  const body = (
    <>
      <Icon size={15} className={`tst-icon ${notice.kind === "busy" ? "spin" : ""}`} aria-hidden />

      <span className="tst-text">
        <strong>{notice.title}</strong>
        {notice.body && <span className="tst-body">{notice.body}</span>}
      </span>
    </>
  );

  return (
    <motion.div
      className={`tst-card kind-${notice.kind}`}
      // From the right, because that is the edge it lives on — a card that
      // arrives from anywhere else reads as a modal rather than as a notice.
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      layout
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      <div className="tst-row">
        {notice.href ? (
          <a className="tst-main" href={notice.href}>
            {body}
          </a>
        ) : (
          <span className="tst-main">{body}</span>
        )}

        <button className="tst-x" onClick={onDismiss} aria-label="Dismiss">
          <X size={13} aria-hidden />
        </button>
      </div>

      {/* The clock, drawn rather than implied. A notice that vanishes without
          warning reads as a glitch; a bar running out says it is about to go
          and how long is left to read it. Paused on hover, which is the only
          moment somebody is definitely still reading. */}
      {notice.ms > 0 && (
        <motion.span
          className="tst-bar"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: held ? 1 : 0 }}
          transition={{ duration: notice.ms / 1000, ease: "linear" }}
          onAnimationComplete={() => {
            if (!held) onDismiss();
          }}
        />
      )}
    </motion.div>
  );
}
