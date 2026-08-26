"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/I18nProvider";
import type { MatchPreview } from "@/lib/tournament/preview";
import "./bubble.css";

// The match hover bubble.
//
// A bracket box has room for two names and two numbers. Everything else a
// series has — which maps, in what order, how each one went — has nowhere to go
// on it, and a click-through to find out is the wrong price for a question you
// ask about every box on the page.
//
// So it follows the cursor rather than anchoring to the box: on a bracket the
// boxes are small and close together, and a bubble pinned to one of them either
// covers its neighbour or points somewhere you are not looking. Following the
// pointer keeps it in the reader's field of view without hiding the row they
// are reading.
//
// Rendered through a portal into <body>. The bracket is an `overflow-x: auto`
// scroller, and a bubble inside it would be clipped by exactly the edge you
// most want to escape.

type Props = {
  preview: MatchPreview | null;
  teamA: string;
  teamB: string;
  children: React.ReactNode;
  /** Extra classes for the wrapper, so the target keeps its own layout. */
  className?: string;
};

/** Distance the bubble floats above the cursor. */
const LIFT = 16;
const EDGE = 10;

export default function MatchBubble({ preview, teamA, teamB, children, className }: Props) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // A pointer that is not a mouse has no hover, and showing a cursor-following
  // bubble on a tap would put it under the finger that opened it.
  const isCoarse = useCallback(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches,
    [],
  );

  const track = (e: React.MouseEvent) => {
    setAt({ x: e.clientX, y: e.clientY });
  };

  // Closing on scroll rather than moving with it: the bubble is placed in
  // viewport coordinates, so a page that scrolls under it leaves it pointing at
  // whatever has slid into that spot.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  if (!preview) {
    return <div className={className}>{children}</div>;
  }

  // Placed after render so the real height is known — a bubble near the bottom
  // of the window has to flip below the cursor rather than run off the screen,
  // and its height depends on how many maps the series has.
  const box = bubbleRef.current?.getBoundingClientRect();
  const width = box?.width ?? 268;
  // Estimated from the row count rather than a constant, so the very first
  // frame — before the ref exists — is already close for a BO3 as well as a BO1.
  const height = box?.height ?? 38 + preview.rows.length * 32;

  const flip = at.y - height - LIFT < EDGE;
  const top = flip ? at.y + LIFT : at.y - height - LIFT;
  const left = Math.min(
    Math.max(EDGE, at.x - width / 2),
    (typeof window === "undefined" ? 1200 : window.innerWidth) - width - EDGE,
  );

  return (
    <div
      className={className}
      onMouseEnter={(e) => {
        if (isCoarse()) return;
        setAt({ x: e.clientX, y: e.clientY });
        setOpen(true);
      }}
      onMouseMove={track}
      onMouseLeave={() => setOpen(false)}
    >
      {children}

      {mounted &&
        open &&
        createPortal(
          <div className={`mb ${flip ? "below" : ""}`} ref={bubbleRef} style={{ top, left }} role="tooltip">
            <div className="mb-head">
              <span className="mb-team">{teamA}</span>
              <span className="mb-bo">BO{preview.bestOf}</span>
              <span className="mb-team mb-team-b">{teamB}</span>
            </div>

            <ol className="mb-rows">
              {preview.rows.map((row) => (
                <li
                  key={row.ordinal}
                  className={`mb-row ${row.map ? "" : "tbd"} ${row.state === "live" ? "live" : ""}`}
                  style={row.image ? ({ "--art": `url("${row.image}")` } as React.CSSProperties) : undefined}
                >
                  <span className={`mb-score ${row.winner === "a" ? "won" : ""}`}>
                    {row.map ? row.scoreA : "—"}
                  </span>

                  <span className="mb-map">
                    {row.label ?? t("bubble.tbd")}
                    {row.decider && <span className="mb-decider">{t("bubble.decider")}</span>}
                  </span>

                  <span className={`mb-score ${row.winner === "b" ? "won" : ""}`}>
                    {row.map ? row.scoreB : "—"}
                  </span>
                </li>
              ))}
            </ol>
          </div>,
          document.body,
        )}
    </div>
  );
}
