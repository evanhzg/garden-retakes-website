"use client";

import { useI18n } from "@/components/I18nProvider";
import "./status.css";

/**
 * A read-only status, that reads as one.
 *
 * These used to be `.chip`, which carries `cursor: pointer`, a hover that
 * lifts and recolours the element, `transition: all .2s` and a 999px radius.
 * Every one of those says "click me", and not one of the twelve places it was
 * used is clickable — they are all a tournament's state, a team's state, a
 * server's state. People clicked them.
 *
 * So: square, filled, static, and captioned. The caption is the other half of
 * the fix. "Registration" alone is a word floating in a box; "STATUS /
 * Registration open" says what kind of fact it is.
 *
 * The value is translated too. It arrives as a raw database string —
 * `registration`, `accepted`, `busy` — and was rendered straight to the page in
 * both languages.
 */
export default function StatusTag({
  kind,
  value,
  label,
  className,
}: {
  /** Which family of states this is, so `running` can differ per family. */
  kind: "tournament" | "team" | "match" | "server" | "member";
  value: string | null | undefined;
  /** Overrides the "STATUS" caption. */
  label?: string;
  /** `tiny` for a header, `compact` inside a dense table row. */
  className?: string;
}) {
  const { t } = useI18n();

  const raw = (value ?? "").trim();
  if (!raw) return null;

  const key = `state.${kind}.${raw.toLowerCase()}`;
  const translated = t(key);

  // translate() returns the key itself when it has no entry, which would put
  // "state.team.something" on the page. A state nobody has named yet is not an
  // error — it is a value the plugin sent that the site has not met before —
  // so fall back to the raw word, tidied.
  const text = translated === key ? humanise(raw) : translated;

  return (
    <span className={`status status-${kind} st-${raw.toLowerCase()}${className ? ` ${className}` : ""}`}>
      <span className="status-label">{label ?? t("status.label")}</span>
      <span className="status-value">{text}</span>
    </span>
  );
}

/** "in_progress" → "In progress". */
function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
