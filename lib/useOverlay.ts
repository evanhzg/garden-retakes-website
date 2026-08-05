"use client";

import { useEffect } from "react";

/**
 * Marks the document while a fullscreen overlay is open.
 *
 * The friends launcher and its drawer are `position: fixed` at z-index 1000 and
 * 1001, mounted once by SocketProvider for the whole app. Anything that takes
 * over the screen — the lineup viewer, the match-found prompt — therefore had a
 * floating "FRIENDS" pill sitting on top of it, and the drawer could be opened
 * over a modal it knew nothing about.
 *
 * Raising every overlay above 1001 would fix the stacking but not the sense of
 * it: a friends button over a twenty-second accept timer is wrong even when it
 * is behind the dialog. So overlays declare themselves here and the chrome
 * steps aside.
 *
 * Counted rather than boolean because overlays nest — opening the lightbox from
 * inside a modal must not let the inner one's cleanup un-hide the chrome while
 * the outer one is still up.
 */

let depth = 0;

export function useOverlay(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    depth += 1;
    document.body.classList.add("overlay-open");
    // Scroll behind a takeover reads as the page coming apart.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        document.body.classList.remove("overlay-open");
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [active]);
}
