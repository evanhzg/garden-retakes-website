"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BellOff, Circle, EyeOff, Moon } from "lucide-react";

import AvatarImage from "@/components/AvatarImage";
import { useI18n } from "@/components/I18nProvider";
import { CHOSEN_STATUSES, type ChosenStatus } from "@/lib/presence";
import "./statusbubble.css";

const ICONS = {
  online: Circle,
  away: Moon,
  dnd: BellOff,
  invisible: EyeOff,
} as const;

/**
 * You, at the top of the right rail.
 *
 * The rail's other three buttons are places to go; this one is who you are,
 * which is why it sits above the rule rather than among them. Clicking it
 * opens the one control the site had nowhere for: the status you CHOOSE, as
 * against the two it observes about you.
 *
 * Optimistic, and deliberately so. Picking a status is a statement about
 * yourself — there is no server answer that could contradict it, only a write
 * that might fail — so the dot moves on the click and rolls back only if the
 * write is refused.
 */
export default function StatusBubble({ steamId }: { steamId: string }) {
  const { t } = useI18n();

  const [status, setStatus] = useState<ChosenStatus>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Where the menu goes, measured from the avatar.
   *
   * IT WAS CLIPPED. The menu was position:absolute inside .sb, which sits
   * inside .friends-rail — and that rail sets overflow-y:auto with
   * overflow-x:hidden so a column of faces can scroll. A menu that opens out
   * of the rail's left edge is horizontal overflow, so the browser cut it off
   * at the rail's border: clicking your own avatar appeared to do nothing.
   *
   * No z-index could have fixed that. Clipping by an overflowing ancestor is
   * not a stacking question — the element has to leave the ancestor, which
   * means a portal and fixed coordinates.
   */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 216;
    const gap = 8;
    // Out of the left edge — the rail is against the right of the screen, so
    // there is only one direction. Clamped so it cannot leave the viewport on
    // a narrow window, and lifted if it would run off the bottom.
    const left = Math.max(8, r.left - width - gap);
    const top = Math.min(r.top, window.innerHeight - 240);
    setPos({ top: Math.max(8, top), left });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/presence", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { presence: null }))
      .then((d) => {
        if (!cancelled) setStatus(d.presence ?? null);
      })
      .catch(() => {
        // The default. A status nobody could read is the same as none.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Every other menu on this site closes on an outside click and on Escape.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The menu is portalled to <body>, so it is no longer inside wrapRef —
      // checking only the wrapper would close it on its own options.
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);

    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = useCallback(
    async (next: Exclude<ChosenStatus, null>) => {
      const previous = status;
      setStatus(next);
      setOpen(false);

      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ presence: next }),
        });
        if (!res.ok) setStatus(previous);
      } catch {
        setStatus(previous);
      }
    },
    [status],
  );

  const current = status ?? "online";

  return (
    <div className="sb" ref={wrapRef}>
      <button
        className={`sb-trigger is-${current}`}
        onClick={() => {
          place();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t(`social.status.${current}`)}
      >
        <AvatarImage steamId={steamId} alt="" className="sb-face" />
        <i className={`sb-dot is-${current}`} aria-hidden />
      </button>

      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={menuRef}
            role="menu"
            className="sb-menu"
            style={{ top: pos.top, left: pos.left }}
            // Out of the rail's LEFT edge, which is the only direction there is
            // — the rail is against the right of the screen.
            initial={{ opacity: 0, x: 8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="sb-menu-head">{t("social.status.title")}</span>

            {CHOSEN_STATUSES.map((s) => {
              const Icon = ICONS[s];
              return (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={current === s}
                  className={`sb-menu-item ${current === s ? "on" : ""}`}
                  onClick={() => choose(s)}
                >
                  <Icon size={13} className={`sb-menu-icon is-${s}`} />
                  <span className="sb-menu-label">{t(`social.status.${s}`)}</span>
                  <span className="sb-menu-hint">{t(`social.status.${s}Hint`)}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
}
