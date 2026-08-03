"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// The bell in the header.
//
// Opening it is what marks things read — not hovering, and not merely having
// the page open. A badge that clears itself while you are looking elsewhere is
// a badge you stop trusting.

type Item = {
  id: string;
  type: string;
  icon: string;
  content: string;
  url: string | null;
  at: string;
  read: boolean;
};

const ago = (iso: string) => {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export default function NotificationCenter() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const j = await res.json();
      if (!j.signedIn) return setItems(null);
      setItems(j.items ?? []);
      setUnread(j.unread ?? 0);
    } catch {
      /* the bell is not worth an error state */
    }
  }, []);

  useEffect(() => {
    load();
    // Pause while the tab is hidden; a backgrounded page does not need to know.
    const id = window.setInterval(() => !document.hidden && load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items === null) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems((cur) => (cur ?? []).map((i) => ({ ...i, read: true })));
      await fetch("/api/notifications", { method: "POST" }).catch(() => {});
    }
  };

  return (
    <div className="notif" ref={wrapRef}>
      <button
        className={`notif-bell ${unread > 0 ? "has-unread" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
      >
        {/* A drawn bell rather than an emoji: the emoji renders differently on
            every platform and cannot take the accent colour when unread. */}
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-dot num">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="menu">
          <div className="notif-head">
            <strong>Notifications</strong>
            <Link href="/feed" className="btn btn-ghost" onClick={() => setOpen(false)}>Feed</Link>
          </div>

          {items.length === 0 ? (
            <p className="notif-empty">Nothing yet.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const inner = (
                  <>
                    <span className="notif-icon" aria-hidden>{n.icon}</span>
                    <span className="notif-text">{n.content}</span>
                    <span className="notif-at num">{ago(n.at)}</span>
                  </>
                );
                return (
                  <li key={n.id} className={n.read ? "" : "unread"}>
                    {n.url ? (
                      n.url.startsWith("http") ? (
                        <a href={n.url} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)}>{inner}</a>
                      ) : (
                        <Link href={n.url} onClick={() => setOpen(false)}>{inner}</Link>
                      )
                    ) : (
                      <span>{inner}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
