"use client";

// The HEADSHOT guess grid and its search box — shared by the solo daily page
// and the lobby race so both play identically.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { searchPlayers, ageOf, type HeadshotPlayer, type Comparison, type Attribute } from "@/scripts/headshotRules";
import { translator, HEADSHOT, type Lang } from "@/components/games/i18n";

export type GuessRow = { player: HeadshotPlayer; result: Comparison };

const COLUMNS: { key: Attribute; label: string }[] = [
  { key: "nationality", label: "colNationality" },
  { key: "team", label: "colTeam" },
  { key: "role", label: "colRole" },
  { key: "age", label: "colAge" },
  { key: "majors", label: "colMajors" },
];

const ROLE_KEYS: Record<string, string> = {
  awp: "roleAwp", igl: "roleIgl", entry: "roleEntry",
  lurker: "roleLurker", support: "roleSupport", rifle: "roleRifle", coach: "roleCoach",
};

/** ISO alpha-2 → regional-indicator flag. Falls back to the bare code. */
export function flagOf(cc: string): React.ReactNode {
  const code = (cc || "").toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) return "🏳";
  return <img src={`https://flagcdn.com/w40/${code}.png`} alt={code} style={{ display: 'inline-block', width: '1.2em', height: 'auto', borderRadius: '2px', verticalAlign: 'middle' }} />;
}

export function countryName(p: HeadshotPlayer, lang: Lang): string {
  return lang === "fr" ? p.countryFr || p.country : p.country;
}

export function rolesLabel(roles: string[], t: (k: any, p?: any) => string): string {
  return (roles || []).map((r) => t(ROLE_KEYS[r] ?? "roleRifle")).join(" · ");
}

/* -------------------------------------------------------------------------- */

export function SearchBox({ pool, exclude, disabled, lang, onPick, autoFocus }: {
  pool: HeadshotPlayer[];
  exclude: string[];
  disabled?: boolean;
  lang: Lang;
  onPick: (p: HeadshotPlayer) => void;
  autoFocus?: boolean;
}) {
  const t = translator(HEADSHOT, lang);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(
    () => (query.trim() ? searchPlayers(query, pool, 8, exclude) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, pool, exclude.join(",")]
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

  const choose = useCallback((p: HeadshotPlayer) => {
    onPick(p);
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
        <span className="hs-search-icon" aria-hidden>🎯</span>
        <input
          className="hs-search-input"
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
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
              <li className="hs-suggestion empty">{t("noMatches")}</li>
            ) : (
              matches.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`hs-suggestion ${i === highlight ? "on" : ""}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(p)}
                  >
                    <span className="hs-sug-flag">{flagOf(p.cc)}</span>
                    <span className="hs-sug-name">{p.name}</span>
                    <span className="hs-sug-team">{p.team}</span>
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

export function GuessGrid({ rows, lang, onDate }: {
  rows: GuessRow[];
  lang: Lang;
  onDate?: string;
}) {
  const t = translator(HEADSHOT, lang);
  if (!rows.length) return null;

  return (
    <div className="hs-grid" role="table">
      <div className="hs-grid-head" role="row">
        <span role="columnheader">{t("colPlayer")}</span>
        {COLUMNS.map((c) => <span key={c.key} role="columnheader">{t(c.label as any)}</span>)}
      </div>

      <AnimatePresence initial={false}>
        {rows.map((row, rowIdx) => (
          <motion.div
            key={row.player.id}
            className="hs-row"
            role="row"
            layout
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
          >
            <Cell delay={0} state={row.result.correct ? "hit" : "name"}>
              <span className="hs-cell-flag">{flagOf(row.player.cc)}</span>
              <span className="hs-cell-name">{row.player.name}</span>
            </Cell>

            <Cell delay={1} state={row.result.nationality.state}>
              <span className="hs-cell-flag">{flagOf(row.player.cc)}</span>
              <span className="hs-cell-sub">{countryName(row.player, lang)}</span>
            </Cell>

            <Cell delay={2} state={row.result.team.state}>
              <span className="hs-cell-text">{row.player.team}</span>
            </Cell>

            <Cell delay={3} state={row.result.role.state}>
              <span className="hs-cell-text">{rolesLabel(row.player.roles, t)}</span>
            </Cell>

            <Cell delay={4} state={row.result.age.state} dir={row.result.age.dir}>
              <span className="hs-cell-big">{row.result.age.value ?? ageOf(row.player, onDate) ?? "?"}</span>
            </Cell>

            <Cell delay={5} state={row.result.majors.state} dir={row.result.majors.dir}>
              <span className="hs-cell-big">{row.result.majors.value ?? row.player.majors}</span>
            </Cell>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Cell({ state, dir, delay, children }: {
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

export function Legend({ lang }: { lang: Lang }) {
  const t = translator(HEADSHOT, lang);
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

/** The emoji square for one attribute, used to build the share text. */
export function squareFor(state: string): string {
  return state === "hit" ? "🟩" : state === "near" ? "🟨" : "⬛";
}

export function shareSquares(result: Comparison): string {
  return COLUMNS.map((c) => squareFor((result as any)[c.key].state)).join("");
}
