"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from '@/components/I18nProvider';

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

const DISMISSED_KEY = "garden_dismissed_notifs";

/** Matches the collapse in globals.css; the row has to still be on screen while
 *  it plays, so the two numbers have to agree. */
const LEAVE_MS = 180;

/** Global events fall out of the window after a fortnight and stop being sent,
 *  so nothing here would ever remove their ids again. Capped rather than left
 *  to grow for the life of the browser profile. */
const DISMISSED_MAX = 200;

/** Mirrors the CSS: the footer toggle wins, and the OS setting decides when it
 *  is on "system". Without this the row would sit there for 180ms doing nothing
 *  at all for someone who asked for less motion. */
const motionOk = () => {
  const pref = document.documentElement.getAttribute("data-motion");
  if (pref === "off") return false;
  if (pref === "full") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const readDismissed = (): string[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Unparseable or unavailable storage means nothing was ever hidden, which
    // is the safe reading: it shows a row too many, never one too few.
    return [];
  }
};

const ago = (iso: string, t: any) => {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}${t('time.secondsShort')}`;
  if (s < 3600) return `${Math.floor(s / 60)}${t('time.minutesShort')}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${t('time.hoursShort')}`;
  return `${Math.floor(s / 86400)}${t('time.daysShort')}`;
};

export default function NotificationCenter({ isAdmin, steamId }: { isAdmin?: boolean, steamId?: string | null }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"notifications" | "tickets">("notifications");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const timers = useRef<number[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const j = await res.json();
      if (!j.signedIn) return setItems(null);
      setItems(j.items ?? []);

      if (isAdmin && steamId) {
         const tRes = await fetch("/api/tickets", { cache: "no-store", headers: { "Authorization": `Bearer ${steamId}` } });
         if (tRes.ok) {
            const tj = await tRes.json();
            setTickets(tj.tickets ?? []);
         }
      }
    } catch {
      /* the bell is not worth an error state */
    }
  }, [isAdmin, steamId]);

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

  // Read on mount rather than in the initial state: the header renders on the
  // server too, and a first paint that already knew what was hidden would not
  // match the one React makes here.
  useEffect(() => {
    setDismissed(readDismissed());
    setRestored(true);
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    // Guarded on the restore so the empty state this starts in is never written
    // over what a previous visit stored.
    if (!restored) return;
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
    } catch {
      // Private mode — the rows simply come back on the next poll.
    }
  }, [dismissed, restored]);

  if (items === null) return null;

  // A row on its way out is still on screen, so it stays in this list until its
  // collapse has finished. The badge counts what the panel would actually show:
  // a number that outlives the row it stands for is worse than no number.
  const visible = items.filter((n) => !dismissed.includes(n.id));
  const unread = visible.filter((n) => !n.read).length;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setItems((cur) => (cur ?? []).map((i) => ({ ...i, read: true })));
      await fetch("/api/notifications", { method: "POST" }).catch(() => {});
    }
  };

  /** Removes the notification, not the thing it announced. A targeted one is a
   *  row of its own and the route deletes it; a global event is derived from a
   *  clip or a Valve post that is nobody's here to delete, so those are only
   *  ever hidden — which is why the id decides and the caller does not have to. */
  const remove = (id: string) => {
    if (leaving.includes(id)) return;
    setLeaving((cur) => [...cur, id]);

    // Sent before the animation rather than after it: the collapse is for the
    // eye, and closing the panel mid-transition should still have deleted it.
    fetch("/api/notifications", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {
      /* it reappears on the next poll, which is the honest outcome */
    });

    timers.current.push(
      window.setTimeout(() => {
        setItems((cur) => (cur ?? []).filter((i) => i.id !== id));
        // A derived event has no row, so this list is the only record that it
        // was ever dismissed.
        if (!id.startsWith("n")) {
          setDismissed((cur) => (cur.includes(id) ? cur : [...cur, id].slice(-DISMISSED_MAX)));
        }
        setLeaving((cur) => cur.filter((v) => v !== id));
      }, motionOk() ? LEAVE_MS : 0)
    );
  };

  return (
    <div className="notif" ref={wrapRef}>
      <button
        className={`notif-bell ${unread > 0 ? "has-unread" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? t('notifications.unreadCount', { n: unread }) : t('notif.title')}
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
          <div className="notif-head" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <strong>{t('notif.title')}</strong>
               <Link href="/feed" className="btn btn-ghost" onClick={() => setOpen(false)}>{t('nav.feed')}</Link>
            </div>
            {isAdmin && (
               <div style={{ display: 'flex', gap: '8px', marginTop: '8px', borderBottom: '1px solid var(--color-divider)' }}>
                  <button onClick={() => setActiveTab("notifications")} style={{ background: 'none', border: 'none', padding: '4px 8px', color: activeTab === "notifications" ? 'var(--color-accent)' : 'var(--color-text)', borderBottom: activeTab === "notifications" ? '2px solid var(--color-accent)' : 'none', cursor: 'pointer' }}>Notifications</button>
                  <button onClick={() => setActiveTab("tickets")} style={{ background: 'none', border: 'none', padding: '4px 8px', color: activeTab === "tickets" ? 'var(--color-accent)' : 'var(--color-text)', borderBottom: activeTab === "tickets" ? '2px solid var(--color-accent)' : 'none', cursor: 'pointer' }}>Tickets ({tickets?.filter(t => t.Status === "OPEN").length || 0})</button>
               </div>
            )}
          </div>

          {activeTab === "notifications" && (
            <>
              {visible.length === 0 ? (
                <p className="notif-empty">{t('notif.empty')}</p>
              ) : (
                <ul className="notif-list">
                  {visible.map((n) => {
                    const inner = (
                      <>
                        <span className="notif-icon" aria-hidden>{n.icon}</span>
                        <span className="notif-text">{n.content}</span>
                        <span className="notif-at num">{ago(n.at, t)}</span>
                      </>
                    );
                    return (
                      <li key={n.id} className={[n.read ? "" : "unread", leaving.includes(n.id) ? "is-leaving" : ""].join(" ").trim()}>
                        {n.url ? (
                          n.url.startsWith("http") ? (
                            <a href={n.url} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)}>{inner}</a>
                          ) : (
                            <Link href={n.url} onClick={() => setOpen(false)}>{inner}</Link>
                          )
                        ) : (
                          <span>{inner}</span>
                        )}
                        {/* Beside the link rather than inside it: a button nested in
                            an anchor is neither valid nor reliably clickable. */}
                        <button
                          type="button"
                          className="notif-x"
                          onClick={() => remove(n.id)}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {activeTab === "tickets" && (
             <ul className="notif-list">
                {tickets?.length === 0 ? (
                   <p className="notif-empty">No tickets</p>
                ) : (
                   tickets?.map(t => (
                      <li key={t.Id} style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '12px' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '12px' }}>Ticket #{t.Id}</strong>
                            <span style={{ fontSize: '12px', color: t.Status === 'OPEN' ? 'var(--color-primary)' : 'var(--color-text)' }}>{t.Status}</span>
                         </div>
                         <p style={{ margin: '0 0 8px 0', fontSize: '13px' }}>{t.Description}</p>
                         <button className="btn btn-secondary btn-sm" onClick={async () => {
                             try {
                                await fetch("/api/messages", {
                                   method: "POST",
                                   headers: { "Content-Type": "application/json", "Authorization": `Bearer ${steamId}` },
                                   body: JSON.stringify({ targetSteamId: t.CreatorSteamId.toString(), content: "Regarding your ticket: " })
                                });
                                await fetch(`/api/tickets/${t.Id}`, { method: "PATCH", body: JSON.stringify({ Status: "RESOLVED" }) });
                                load();
                                setOpen(false);
                                alert("DM thread started. Open Friends -> MESSAGES to reply.");
                             } catch(e) {}
                         }}>Reply in DMs</button>
                      </li>
                   ))
                )}
             </ul>
          )}
        </div>
      )}
    </div>
  );
}
