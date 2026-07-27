"use client";

// The daily-guesser board, driven by a column schema.
//
// HEADSHOT (CS pros) and PENTAKILL (LoL champions) compare completely different
// attributes but play identically: type a name, get a row of hit / near / miss
// tiles with an arrow on the numeric ones. Everything game-specific arrives as
// a `GuessColumn[]` and a couple of render callbacks, so the interaction, the
// animation and the share grid only exist once.
//
// Styling lives in components/games/headshot/headshot.css under the `hs-`
// prefix — both games load it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Lang } from "@/components/games/i18n";

export type MatchState = "hit" | "near" | "miss";
export type Cell = { state: MatchState; dir?: "up" | "down" | null };
export type Comparison = { correct: boolean } & Record<string, any>;

export type GuessColumn<T> = {
  /** Key into the comparison object produced by the game's `compare`. */
  key: string;
  /** i18n key for the column header. */
  label: string;
  /** What the tile shows for a given guess. */
  cell: (item: T, lang: Lang) => React.ReactNode;
  /** Narrow column, for single numbers. */
  compact?: boolean;
};

export type GuessRow<T> = { item: T; result: Comparison };

/* -------------------------------------------------------------------------- */

export function SearchBox<T extends { id: string }>({
  pool, exclude, disabled, onPick, autoFocus, placeholder, emptyLabel, search, renderOption, icon,
}: {
  pool: T[];
  exclude: string[];
  disabled?: boolean;
  onPick: (item: T) => void;
  autoFocus?: boolean;
  placeholder: string;
  emptyLabel: string;
  search: (query: string, pool: T[], limit: number, exclude: string[]) => T[];
  renderOption: (item: T) => React.ReactNode;
  icon?: string;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(
    () => (query.trim() ? search(query, pool, 8, exclude) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, pool, exclude.join(","), search]
  );

  useEffect(() => setHighlight(0), [query]);

  // Clicking anywhere else closes the dropdown without clearing what was typed.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = useCallback((item: T) => {
    onPick(item);
    setQuery("");
    setOpen(false);
  }, [onPick]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter") { e.preventDefault(); choose(matches[highlight]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="hs-search" ref={boxRef}>
      <div className="hs-search-field">
        <span className="hs-search-icon" aria-hidden>{icon ?? "🎯"}</span>
        <input
          className="hs-search-input"
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <AnimatePresence>
        {open && query.trim() && (
          <motion.ul
            className="hs-suggestions"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
          >
            {matches.length === 0 ? (
              <li className="hs-suggestion empty">{emptyLabel}</li>
            ) : (
              matches.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`hs-suggestion ${i === highlight ? "on" : ""}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(item)}
                  >
                    {renderOption(item)}
                  </button>
                </li>
              ))
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function GuessGrid<T extends { id: string }>({
  rows, columns, lang, t, headLabel, renderHead,
}: {
  rows: GuessRow<T>[];
  columns: GuessColumn<T>[];
  lang: Lang;
  t: (k: any, p?: any) => string;
  headLabel: string;
  renderHead: (item: T, lang: Lang) => React.ReactNode;
}) {
  if (!rows.length) return null;

  // The name column plus one per attribute; compact columns get less room.
  const template = `minmax(120px, 1.4fr) ${columns
    .map((c) => (c.compact ? "minmax(64px, 0.7fr)" : "minmax(96px, 1.2fr)"))
    .join(" ")}`;
  const minWidth = 120 + columns.reduce((sum, c) => sum + (c.compact ? 64 : 96), 0) + columns.length * 6;

  return (
    <div className="hs-grid" role="table">
      <div className="hs-grid-head" role="row" style={{ gridTemplateColumns: template, minWidth }}>
        <span role="columnheader">{headLabel}</span>
        {columns.map((c) => <span key={c.key} role="columnheader">{t(c.label)}</span>)}
      </div>

      <AnimatePresence initial={false}>
        {rows.map((row) => (
          <motion.div
            key={row.item.id}
            className="hs-row"
            role="row"
            layout
            style={{ gridTemplateColumns: template, minWidth }}
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
          >
            <BoardCell delay={0} state={row.result.correct ? "hit" : "name"}>
              {renderHead(row.item, lang)}
            </BoardCell>

            {columns.map((c, ci) => {
              const cell: Cell = row.result[c.key] ?? { state: "miss" };
              return (
                <BoardCell key={c.key} delay={ci + 1} state={cell.state} dir={cell.dir}>
                  {c.cell(row.item, lang)}
                </BoardCell>
              );
            })}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function BoardCell({ state, dir, delay, children }: {
  state: string;
  dir?: "up" | "down" | null;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={`hs-cell ${state}`}
      role="cell"
      initial={{ rotateX: -90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ delay: delay * 0.11, duration: 0.34, ease: [0.2, 0.8, 0.3, 1] }}
    >
      <span className="hs-cell-inner">{children}</span>
      {dir && <span className={`hs-cell-arrow ${dir}`} aria-label={dir === "up" ? "higher" : "lower"}>{dir === "up" ? "▲" : "▼"}</span>}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */

export function Legend({ t }: { t: (k: any, p?: any) => string }) {
  return (
    <div className="hs-legend">
      <span className="hs-legend-title">{t("legendTitle")}</span>
      <span className="hs-legend-item"><i className="hs-swatch hit" />{t("legendHit")}</span>
      <span className="hs-legend-item"><i className="hs-swatch near" />{t("legendNear")}</span>
      <span className="hs-legend-item"><i className="hs-swatch miss" />{t("legendMiss")}</span>
      <span className="hs-legend-item">{t("legendArrow")}</span>
    </div>
  );
}

export function ColumnToggles<T>({ columns, active, onToggle, t }: {
  columns: GuessColumn<T>[];
  active: Set<string>;
  onToggle: (key: string) => void;
  t: (k: any, p?: any) => string;
}) {
  return (
    <div className="hs-column-toggles" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px", justifyContent: "center" }}>
      {columns.map(c => (
        <button
          key={c.key}
          onClick={() => onToggle(c.key)}
          className={`hs-toggle-btn ${active.has(c.key) ? "on" : "off"}`}
          style={{
            padding: "4px 8px", borderRadius: "4px", fontSize: "0.85rem", cursor: "pointer",
            background: active.has(c.key) ? "var(--accent)" : "transparent",
            border: `1px solid var(--accent)`,
            color: active.has(c.key) ? "#fff" : "var(--accent)",
            opacity: active.has(c.key) ? 1 : 0.6
          }}
        >
          {t(c.label)}
        </button>
      ))}
    </div>
  );
}

/** The emoji row for one guess, used to build the shareable result grid. */
export function shareSquares(result: Comparison, columns: { key: string }[]): string {
  return columns
    .map((c) => {
      const state = result[c.key]?.state;
      return state === "hit" ? "🟩" : state === "near" ? "🟨" : "⬛";
    })
    .join("");
}
