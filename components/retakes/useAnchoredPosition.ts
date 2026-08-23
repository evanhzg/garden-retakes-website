"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type Anchored = {
  top: number;
  left: number;
  /** True when there was no room above and it had to go under the anchor. */
  below: boolean;
  /** Where the tail should point, in pixels from the bubble's left edge. */
  tail: number;
};

/**
 * Keep a floating panel pinned to the element that opened it.
 *
 * It measures the anchor rather than being handed one, and re-measures on
 * scroll and resize, because the first version took a `DOMRect` captured at
 * click time and closed itself whenever anything scrolled. That looked fine on
 * the loadout page and was broken inside the lobby's first-run gate: the gate's
 * body scrolls, so clicking a card scrolled it into view, which fired a scroll
 * event, which shut the menu in the same tick it opened. The menu simply never
 * appeared there.
 *
 * Following the anchor is also the better behaviour — a panel that vanishes
 * because the page moved two pixels reads as a bug either way.
 *
 * Placed above the anchor when it fits, since that is where the eye already is,
 * and clamped into the viewport on both axes. `tail` is returned separately so
 * the pointer keeps aiming at the anchor even when the panel has been pushed
 * sideways to fit.
 */
export function useAnchoredPosition(
  anchor: HTMLElement | null,
  ref: RefObject<HTMLElement | null>,
  gap = 10
): Anchored | null {
  const [pos, setPos] = useState<Anchored | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;

    const place = () => {
      const el = ref.current;
      if (!el) return;
      const a = anchor.getBoundingClientRect();
      const box = el.getBoundingClientRect();

      const above = a.top - box.height - gap;
      const fitsAbove = above >= 12;
      const top = fitsAbove
        ? above
        : Math.min(a.bottom + gap, window.innerHeight - box.height - 12);
      const left = Math.min(
        Math.max(12, a.left + a.width / 2 - box.width / 2),
        Math.max(12, window.innerWidth - box.width - 12)
      );

      const next: Anchored = {
        top: Math.round(top),
        left: Math.round(left),
        below: !fitsAbove,
        tail: Math.round(a.left + a.width / 2 - left),
      };

      // Only write when something actually moved: this runs on every scroll
      // event, and a fresh object each time would re-render the panel all the
      // way down a long scroll.
      setPos((prev) =>
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.below === next.below &&
        prev.tail === next.tail
          ? prev
          : next
      );
    };

    place();
    // Capture, so a scroll inside any ancestor container counts and not just
    // the window's own.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, ref, gap]);

  return pos;
}
