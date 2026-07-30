"use client";

import { useState } from "react";
import AvatarImage from "@/components/AvatarImage";
import PlayerBubble from "@/components/social/PlayerBubble";

export type BoardRow = { steamId: string; name: string; value: string };
export type Board = { title: string; unit: string; rows: BoardRow[] };

/**
 * Season leaders as one table with tabs.
 *
 * This was ten stacked tables, each with its own heading, its own header row and
 * the same five-ish players in every one — the page read as the same thing said
 * ten times. One table, one set of tabs, same data.
 */
export default function LeaderboardTabs({ boards }: { boards: Board[] }) {
  const [active, setActive] = useState(0);
  const board = boards[active] ?? boards[0];

  if (!board) return null;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Season leaders"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          borderBottom: "2px solid var(--color-divider)",
          marginBottom: 4,
        }}
      >
        {boards.map((b, i) => {
          const on = i === active;
          return (
            <button
              key={b.title}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              style={{
                appearance: "none",
                border: 0,
                borderBottom: `2px solid ${on ? "var(--color-accent)" : "transparent"}`,
                marginBottom: -2,
                background: "none",
                cursor: "pointer",
                font: "inherit",
                fontFamily: "var(--font-heading)",
                fontWeight: on ? 800 : 600,
                fontSize: 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: on ? "var(--color-accent)" : "color-mix(in srgb, var(--color-text) 60%, transparent)",
                padding: "10px 14px",
                transition: "color 0.18s ease, border-color 0.18s ease",
              }}
            >
              {b.title}
            </button>
          );
        })}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 48 }}>#</th>
            <th>Player</th>
            <th style={{ textAlign: "right" }}>{board.unit}</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((r, i) => (
            // Keyed by tab too, so switching re-runs the row entrance rather
            // than React reusing the DOM and the change passing unnoticed.
            <tr
              key={`${board.title}-${r.steamId}`}
              style={{
                animation: "gr-fade-up 0.32s cubic-bezier(.16,1,.3,1) both",
                animationDelay: `${i * 0.035}s`,
              }}
            >
              <td className="num" style={{ color: i === 0 ? "var(--color-accent)" : "var(--color-neutral-600)", fontWeight: 700 }}>
                {String(i + 1).padStart(2, "0")}
              </td>
              <td>
                <PlayerBubble steamId={r.steamId} name={r.name}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <AvatarImage steamId={r.steamId} alt={r.name} className="avatar avatar-sm" />
                    <span>{r.name}</span>
                  </span>
                </PlayerBubble>
              </td>
              <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                {r.value}
              </td>
            </tr>
          ))}
          {board.rows.length === 0 && (
            <tr>
              <td className="text-muted" colSpan={3}>
                Not enough data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
