"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import "./collapsible.css";

/**
 * A section that folds.
 *
 * The admin page listed every team and every unfinished match expanded, so a
 * sixteen-team tournament was a page you scrolled for a minute to reach the
 * thing you came for. Folded, the same page is a list you can see at once and
 * open the one row you actually want.
 *
 * Open by default is a prop rather than a rule: the first thing on a page
 * should usually already be open, and everything after it usually should not.
 *
 * Uses a real button and aria-expanded rather than <details>, because the
 * summary marker in <details> cannot be styled consistently across browsers and
 * this one carries a count and a status on the right.
 */
export default function Collapsible({
  title,
  meta,
  defaultOpen = false,
  tone,
  children,
}: {
  title: React.ReactNode;
  /** Shown on the right of the header, and while folded. */
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  /** Colours the left rule, for a row that needs attention. */
  tone?: "accent" | "muted";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`cl ${open ? "open" : ""} ${tone ? `tone-${tone}` : ""}`}>
      <button
        type="button"
        className="cl-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className="cl-chev" size={15} aria-hidden />
        <span className="cl-title">{title}</span>
        {meta && <span className="cl-meta">{meta}</span>}
      </button>

      {/* Unmounted when closed rather than hidden: these bodies hold forms with
          their own state and live fetches, and forty mounted-but-invisible
          rosters is forty components doing work nobody can see. */}
      {open && <div className="cl-body">{children}</div>}
    </section>
  );
}
