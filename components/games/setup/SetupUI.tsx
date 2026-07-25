"use client";

// Shared chrome for the lobby's per-game setup.
//
// Options used to sit in a tall column on the lobby page, which meant scrolling
// past three screens of switches to find the one you wanted. They now live in a
// modal with tabs, and the lobby itself only shows a row of chips summarising
// what is currently selected — so the table can read the ruleset at a glance
// and the host can open the full thing when they actually want to change it.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./setup.css";

export type Chip = { label: string; tone?: "on" | "off" | "info" };

/* -------------------------------------------------------------------------- */

export function SummaryChips({ chips, empty }: { chips: Chip[]; empty?: string }) {
  if (!chips.length) return <span className="setup-chips-empty">{empty}</span>;
  return (
    <div className="setup-chips">
      {chips.map((c, i) => (
        <span key={i} className={`setup-chip ${c.tone ?? "info"}`}>{c.label}</span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function SetupModal({ open, title, subtitle, icon, onClose, children }: {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="setup-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="setup-modal"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="setup-modal-head">
              {icon && <span className="setup-modal-icon">{icon}</span>}
              <div className="setup-modal-titles">
                <h2>{title}</h2>
                {subtitle && <span>{subtitle}</span>}
              </div>
              <button className="setup-modal-close" onClick={onClose} aria-label="Close">✕</button>
            </header>
            <div className="setup-modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */

export type Tab = { id: string; label: string; icon?: string; badge?: string; node: React.ReactNode };

export function SetupTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  // A tab can disappear when an option changes (HASAMEME hides Templates in GIF
  // mode), so fall back rather than render nothing.
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="setup-tabs">
      <div className="setup-tablist" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={current?.id === t.id}
            className={`setup-tab ${current?.id === t.id ? "on" : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.icon && <span className="setup-tab-icon">{t.icon}</span>}
            <span className="setup-tab-label">{t.label}</span>
            {t.badge && <span className="setup-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="setup-tabpanel" role="tabpanel">{current?.node}</div>
    </div>
  );
}

/* ------------------------------------------------------------- primitives */

/** A row of mutually exclusive values — rounds, timers, counts. */
export function Stepper({ label, hint, value, options, unit, disabled, onPick }: {
  label: string;
  hint?: string;
  value: number | string;
  options: (number | string)[];
  unit?: (v: any) => string;
  disabled?: boolean;
  onPick: (v: any) => void;
}) {
  return (
    <div className="setup-stepper">
      <span className="setup-stepper-label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      <div className="setup-stepper-opts">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            className={value === o ? "on" : ""}
            disabled={disabled}
            onClick={() => onPick(o)}
          >
            {unit ? unit(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An on/off rule with a one-line explanation of what it does. */
export function ToggleCard({ name, desc, on, disabled, locked, wide, glyph, onToggle }: {
  name: string;
  desc?: string;
  on: boolean;
  disabled?: boolean;
  locked?: boolean;
  wide?: boolean;
  glyph?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`setup-toggle ${on ? "on" : ""} ${locked ? "locked" : ""} ${wide ? "wide" : ""}`}
      disabled={disabled || locked}
      onClick={onToggle}
      title={desc}
    >
      <span className="setup-toggle-top">
        <span className="setup-toggle-name">{glyph && <b className="setup-toggle-glyph">{glyph}</b>}{name}</span>
        <span className={`setup-switch ${on ? "on" : ""}`} aria-hidden />
      </span>
      {desc && <span className="setup-toggle-desc">{desc}</span>}
    </button>
  );
}

/** Big mutually-exclusive choices — board size, answer mode, who starts. */
export function ChoiceRow({ label, value, options, disabled, onPick }: {
  label?: string;
  value: string | number;
  options: { value: string | number; label: string; desc?: string; glyph?: string }[];
  disabled?: boolean;
  onPick: (v: any) => void;
}) {
  return (
    <div className="setup-choice-block">
      {label && <span className="setup-block-label">{label}</span>}
      <div className="setup-choice-row">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={`setup-choice ${value === o.value ? "on" : ""}`}
            disabled={disabled}
            onClick={() => onPick(o.value)}
          >
            {o.glyph && <span className="setup-choice-glyph">{o.glyph}</span>}
            <span className="setup-choice-label">{o.label}</span>
            {o.desc && <span className="setup-choice-desc">{o.desc}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Multi-select pills — word packs, template packs. */
export function PackGrid({ label, hint, packs, values, disabled, onToggle }: {
  label?: string;
  hint?: string;
  packs: { key: string; label: string; glyph?: string }[];
  values: Record<string, boolean>;
  disabled?: boolean;
  onToggle: (key: string, on: boolean) => void;
}) {
  return (
    <div className="setup-choice-block">
      {label && <span className="setup-block-label">{label}{hint && <em>{hint}</em>}</span>}
      <div className="setup-pack-grid">
        {packs.map((p) => {
          const on = !!values[p.key];
          return (
            <button
              key={p.key}
              type="button"
              className={`setup-pack ${on ? "on" : ""}`}
              disabled={disabled}
              onClick={() => onToggle(p.key, !on)}
            >
              {p.glyph && <span className="setup-pack-glyph">{p.glyph}</span>}
              <span className="setup-pack-label">{p.label}</span>
              <span className="setup-pack-check" aria-hidden>{on ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PresetRow({ label, presets, disabled, onPick }: {
  label: string;
  presets: { id: string; label: string }[];
  disabled?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="setup-presets">
      <span className="setup-presets-label">{label}</span>
      {presets.map((p) => (
        <button key={p.id} type="button" className="setup-preset" disabled={disabled} onClick={() => onPick(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function SetupSection({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="setup-section">
      {(title || hint) && (
        <div className="setup-section-head">
          {title && <h4>{title}</h4>}
          {hint && <span>{hint}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
