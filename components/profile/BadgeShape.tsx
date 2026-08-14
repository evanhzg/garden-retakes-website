"use client";

import { useId, type ReactNode } from "react";

// The one shape both rank levels and medals are drawn on, so the profile
// reads as one system instead of two. A crest, not FACEIT's chevron — flat
// top, rounded point at the bottom, closer to a shield than a flag.

const SHIELD_PATH =
  "M50 2 L94 18 L94 54 C94 80 74 97 50 108 C26 97 6 80 6 54 L6 18 Z";

export function BadgeShape({
  size = 56,
  colors,
  glow = false,
  children,
}: {
  size?: number;
  colors: [string, string];
  glow?: boolean;
  children?: ReactNode;
}) {
  const gid = useId();

  return (
    <span
      className={`badge-shape${glow ? " glow" : ""}`}
      style={{ width: size, height: size * 1.08, ["--badge-glow" as string]: colors[1] }}
    >
      <svg viewBox="0 0 100 110" width="100%" height="100%" aria-hidden focusable="false">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <path d={SHIELD_PATH} fill={`url(#${gid})`} stroke="rgba(255,255,255,0.32)" strokeWidth="1.5" />
        <path d={SHIELD_PATH} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1" transform="scale(0.94) translate(3.2 3.6)" opacity="0.4" />
      </svg>
      <span className="badge-shape-content">{children}</span>
    </span>
  );
}
