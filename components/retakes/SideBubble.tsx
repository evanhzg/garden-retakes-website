"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Ban } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAnchoredPosition } from "@/components/retakes/useAnchoredPosition";
import type { Side } from "@/lib/retakeLoadout";

/** What the target is set to. `null` is "nobody takes this". */
export type SideChoice = Side | "both" | null;

/**
 * "Who is this for" — T, CT, both, or nobody — as four targets rather than one.
 *
 * The card used to cycle: click for T, again for CT, again for both, again for
 * off. Saying "both", the most common answer, cost three clicks and you could
 * not get there without passing through two states you did not mean. Worse, it
 * was unguessable — nothing on a card that toggles tells you it has four
 * positions, so the way to find out was to click it and watch.
 *
 * This is the shape the inventory already uses for the same question. Its
 * skins open a small menu with Equip (T) / Equip (CT) / Equip (Both) on it, and
 * a player who has equipped a skin on this site has already learned this
 * control. Reusing it is worth more than anything a bespoke widget would buy.
 *
 * Anchored to the thing it was opened from, and rendered in a portal so it can
 * sit over the loadout gate's scrolling body — a popup clipped by its own
 * scroll container is the bug this avoids rather than a style choice. It tracks
 * that element rather than a rect measured once; see useAnchoredPosition for
 * why, which is a bug this had.
 */
export default function SideBubble({
  anchor,
  value,
  title,
  subtitle,
  /** T is refused for the CT-only options — a defuse kit has no T meaning. */
  allowT = true,
  allowCt = true,
  onPick,
  onClose,
}: {
  /** The control this hangs off. Tracked, not snapshotted. */
  anchor: HTMLElement;
  value: SideChoice;
  title: string;
  subtitle?: string;
  allowT?: boolean;
  allowCt?: boolean;
  onPick: (choice: SideChoice) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition(anchor, ref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options: { id: SideChoice; label: string; cls: string; on: boolean; disabled: boolean }[] = [
    {
      id: "T",
      label: t("loadout.side.T"),
      cls: "t",
      on: value === "T",
      disabled: !allowT,
    },
    {
      id: "CT",
      label: t("loadout.side.CT"),
      cls: "ct",
      on: value === "CT",
      disabled: !allowCt,
    },
    {
      id: "both",
      label: t("loadout.bundle.sideBoth"),
      cls: "both",
      on: value === "both",
      disabled: !allowT || !allowCt,
    },
  ];

  const body = (
    <div className="lo-sidebubble-scrim" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <motion.div
        ref={ref}
        className={`lo-sidebubble ${pos?.below ? "below" : "above"}`}
        role="menu"
        aria-label={title}
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          // Hidden rather than transparent until it has been measured. Driving
          // the entrance animation off "have we measured yet" left it stuck at
          // opacity 0: the first render animates to 0, and flipping the target
          // to 1 a tick later is not a change framer re-runs the entrance for.
          visibility: pos ? "visible" : "hidden",
          // Anchored horizontally so the tail points at the card even when the
          // bubble has been clamped to the viewport edge.
          ["--tail" as string]: pos ? `${pos.tail}px` : "50%",
        }}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
      >
        <div className="lo-sidebubble-head">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>

        <div className="lo-sidebubble-options">
          {options.map((o) => (
            <button
              key={String(o.id)}
              type="button"
              role="menuitemradio"
              aria-checked={o.on}
              disabled={o.disabled}
              className={`lo-sidebubble-option ${o.cls} ${o.on ? "on" : ""}`}
              onClick={() => {
                // Picking what is already picked clears it, so the way out of
                // a choice is the control you made it with.
                onPick(o.on ? null : o.id);
                onClose();
              }}
            >
              <span className="lo-sidebubble-tag">{o.id === "both" ? "T/CT" : o.id}</span>
              {o.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          role="menuitemradio"
          aria-checked={value === null}
          className={`lo-sidebubble-clear ${value === null ? "on" : ""}`}
          onClick={() => {
            onPick(null);
            onClose();
          }}
        >
          <Ban size={13} />
          {t("loadout.bundle.sideNone")}
        </button>
      </motion.div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
