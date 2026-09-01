"use client";

import { motion } from "framer-motion";

/**
 * The rule under the tab you are on, as one element that moves.
 *
 * `.pro-tab.active` marks itself with `border-bottom-color`, which cannot
 * animate between two elements — the old tab's rule disappears and the new
 * one's appears, and nothing connects them. Ten components share that class,
 * so this is the piece they can all adopt one at a time rather than each
 * growing its own copy of a framer marker.
 *
 * `group` has to be unique per tab bar on the page: framer matches the marker
 * to its previous position by layoutId, so two bars sharing one id would make
 * a mark fly across the page from one bar to the other.
 */
export default function TabMark({ group }: { group: string }) {
  return (
    <motion.span
      className="tab-mark"
      layoutId={`tab-mark-${group}`}
      transition={{ type: "spring", stiffness: 520, damping: 42 }}
      aria-hidden
    />
  );
}
