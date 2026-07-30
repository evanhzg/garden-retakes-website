"use client";

import Link from "next/link";
import { useState } from "react";
import AvatarImage from "@/components/AvatarImage";
import Reveal from "./Reveal";

export type LadderRow = {
  steamId: string;
  name: string;
  elo: number;
  avatar: string;
  kd: number | null;
  adr: number | null;
  winPct: number | null;
  isYou: boolean;
};

/**
 * The ladder. Each row hides a stat readout that expands on hover, so the
 * default view stays a clean rank/name/ELO column and the detail is one
 * gesture away rather than a fourth, fifth and sixth column.
 *
 * Touch has no hover, so a tap toggles the same readout.
 */
export default function LadderRows({ rows }: { rows: LadderRow[] }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div>
      {rows.map((row, i) => {
        const open = active === row.steamId;
        const rankColor =
          i === 0 ? "var(--color-accent)" : i < 3 ? "var(--color-accent-700)" : "var(--color-neutral-600)";

        return (
          <Reveal key={row.steamId} delay={Math.min(i * 0.03, 0.3)}>
            <div
              className="gr-row"
              onMouseEnter={() => setActive(row.steamId)}
              onMouseLeave={() => setActive((cur) => (cur === row.steamId ? null : cur))}
              onClick={() => setActive((cur) => (cur === row.steamId ? null : row.steamId))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "clamp(16px, 3vw, 32px)",
                padding: "18px 0",
                borderBottom: "1px solid var(--color-divider)",
                cursor: "pointer",
                background: open ? "color-mix(in srgb, var(--color-text) 4%, transparent)" : "transparent",
                transform: open ? "translateX(6px)" : "none",
              }}
            >
              <div
                className="num"
                style={{ width: 44, fontWeight: 700, fontSize: 15, color: rankColor, flexShrink: 0 }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>

              {/* Desaturated at rest, full colour as the row opens — the
                  portrait "arrives" with the stats rather than sitting apart. */}
              <AvatarImage
                steamId={row.steamId}
                src={row.avatar}
                alt={row.name}
                className="avatar avatar-desat"
                // Both ends declared explicitly: clearing the inline property
                // and letting the class take over gave a jump, not a fade.
                style={{ filter: open ? "grayscale(0) contrast(1)" : "grayscale(1) contrast(1.08)" }}
              />

              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <Link
                  href={`/players/${row.steamId}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 600,
                    fontSize: 17,
                    letterSpacing: "-0.01em",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  {row.name}
                </Link>
                {row.isYou && (
                  <span className="tag tag-outline" style={{ marginLeft: 10, verticalAlign: "middle" }}>
                    you
                  </span>
                )}
              </div>

              {/* The ELO slides left as the readout opens, so the stats look
                  like they are pushing it aside rather than appearing beside a
                  static column. */}
              <div
                className="num"
                style={{
                  fontWeight: 700,
                  fontSize: 20,
                  color: "var(--color-accent)",
                  textAlign: "right",
                  width: 70,
                  flexShrink: 0,
                  transform: open ? "translateX(-10px)" : "none",
                  transition: "transform 0.45s cubic-bezier(.22,1,.36,1)",
                }}
              >
                {row.elo}
              </div>

              <div
                className="gr-preview"
                style={{
                  maxWidth: open ? 300 : 0,
                  opacity: open ? 1 : 0,
                  display: "flex",
                  gap: 24,
                  flexShrink: 0,
                }}
              >
                {/* Each figure follows the one before it, so the readout reads
                    as it opens instead of all three landing at once. */}
                <Stat label="K/D" value={row.kd?.toFixed(2)} open={open} index={0} />
                <Stat label="ADR" value={row.adr != null ? Math.round(row.adr) : undefined} open={open} index={1} />
                <Stat label="Win" value={row.winPct != null ? `${Math.round(row.winPct)}%` : undefined} open={open} index={2} />
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  open,
  index,
}: {
  label: string;
  value?: string | number;
  open: boolean;
  index: number;
}) {
  return (
    <div
      style={{
        whiteSpace: "nowrap",
        opacity: open ? 1 : 0,
        transform: open ? "none" : "translateX(-8px)",
        transition: "opacity 0.3s cubic-bezier(.16,1,.3,1), transform 0.3s cubic-bezier(.16,1,.3,1)",
        transitionDelay: open ? `${0.06 + index * 0.05}s` : "0s",
      }}
    >
      <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
        {value ?? "—"}
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
