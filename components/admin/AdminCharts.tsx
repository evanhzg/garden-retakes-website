"use client";

import { useState } from "react";
import "./admin.css";

/**
 * The two chart shapes the admin dashboards need, drawn by hand.
 *
 * No charting library: the repository has none installed, and a dependency
 * whose smallest useful bundle is larger than this whole panel would be a poor
 * trade for two forms. Everything here is inline SVG and CSS custom properties,
 * so both themes are handled by the tokens rather than by a second palette.
 *
 * Two rules the shapes follow, because breaking either is how a dashboard
 * starts lying:
 *
 *   One measure per plot. Two series on two scales invents a correlation that
 *   is not in the data, so a second measure gets a second chart.
 *
 *   Every value is readable without hovering. The tooltip is a convenience; the
 *   numbers also exist in the table under each chart, which is what a screen
 *   reader and a printout get.
 */

/** A day bucket: the ISO date it covers and how many things happened in it. */
export type DayPoint = { day: string; value: number };

const STEP = 16;
const BAR = 11;
const PLOT = 84;

const dayLabel = (iso: string, locale: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * Counts per day, as columns.
 *
 * Bars rather than a line because the days are discrete buckets — there is no
 * value "between Tuesday and Wednesday" for a line to pass through — and
 * because a bar of zero height is honestly empty where a line would draw
 * straight over the gap.
 */
export function BarTrend({
  title,
  points,
  unit,
  locale = "en",
  tone = "accent",
  emptyText = "Nothing yet",
}: {
  title: string;
  points: DayPoint[];
  /** What one unit is, for the readout: "rounds", "actions", "matches". */
  unit: string;
  locale?: string;
  /** `accent` for the measure the card is about, `neutral` for context. */
  tone?: "accent" | "neutral";
  emptyText?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const total = points.reduce((sum, p) => sum + p.value, 0);
  const peak = points.reduce((max, p) => Math.max(max, p.value), 0);
  const width = Math.max(points.length * STEP, STEP);

  const shown = hover !== null ? points[hover] : null;

  return (
    <figure className={`adm-chart adm-chart-${tone}`}>
      <figcaption className="adm-chart-head">
        <span className="adm-chart-title">{title}</span>
        <span className="adm-chart-read">
          {shown ? (
            <>
              <strong className="num">{shown.value.toLocaleString(locale)}</strong>
              <span className="adm-chart-when">{dayLabel(shown.day, locale)}</span>
            </>
          ) : (
            <>
              <strong className="num">{total.toLocaleString(locale)}</strong>
              <span className="adm-chart-when">
                {unit} · {points.length}d
              </span>
            </>
          )}
        </span>
      </figcaption>

      {total === 0 ? (
        <p className="adm-chart-empty">{emptyText}</p>
      ) : (
        <>
          <svg
            className="adm-chart-svg"
            viewBox={`0 0 ${width} ${PLOT}`}
            role="img"
            aria-label={`${title}: ${total.toLocaleString(locale)} ${unit} over ${points.length} days, peaking at ${peak}.`}
            onMouseLeave={() => setHover(null)}
          >
            {/* One hairline at the peak and one at the baseline. More gridlines
                would be more chrome than data at this size. */}
            <line x1={0} y1={0.5} x2={width} y2={0.5} className="adm-chart-grid" />
            <line x1={0} y1={PLOT - 0.5} x2={width} y2={PLOT - 0.5} className="adm-chart-axis" />

            {points.map((point, i) => {
              // A day with one round has to be visibly taller than a day with
              // none, or the chart reads as an outage.
              const height = point.value === 0 ? 0 : Math.max(1.5, (point.value / peak) * (PLOT - 6));
              return (
                <rect
                  key={point.day}
                  x={i * STEP + (STEP - BAR) / 2}
                  y={PLOT - height}
                  width={BAR}
                  height={height}
                  rx={1.5}
                  className={`adm-chart-bar ${hover === i ? "hot" : ""}`}
                />
              );
            })}

            {/* Hit targets are full height and the whole column wide: a 1px bar
                for a quiet day is otherwise unhoverable. */}
            {points.map((point, i) => (
              <rect
                key={`hit-${point.day}`}
                x={i * STEP}
                y={0}
                width={STEP}
                height={PLOT}
                className="adm-chart-hit"
                tabIndex={0}
                role="img"
                aria-label={`${dayLabel(point.day, locale)}: ${point.value} ${unit}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            ))}
          </svg>

          <div className="adm-chart-axislabels">
            <span>{dayLabel(points[0].day, locale)}</span>
            <span>{dayLabel(points[points.length - 1].day, locale)}</span>
          </div>
        </>
      )}

      {/* The same numbers without the picture. A chart whose only reading is
          hover is unreadable to half the people who open this page. */}
      <details className="adm-chart-table">
        <summary>{title} — table</summary>
        <table className="table">
          <tbody>
            {points.map((point) => (
              <tr key={point.day}>
                <td className="muted num">{dayLabel(point.day, locale)}</td>
                <td className="num">{point.value.toLocaleString(locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export type MeterSegment = {
  label: string;
  value: number;
  /** Status, not identity — these colours mean a state and are never reused. */
  tone: "good" | "busy" | "bad" | "idle";
};

/**
 * A fleet, as one bar plus a labelled count per state.
 *
 * A pie of four slices would be the same information read worse, and the states
 * are exclusive shares of one total, which is what a stacked bar is for. The
 * counts are written out beside the colours rather than left to a legend: these
 * are status colours, and status must never be carried by colour alone.
 */
export function StatusMeter({
  segments,
  total,
  emptyText,
}: {
  segments: MeterSegment[];
  total: number;
  emptyText: string;
}) {
  if (total === 0) return <p className="adm-chart-empty">{emptyText}</p>;

  const present = segments.filter((s) => s.value > 0);

  return (
    <div className="adm-meter">
      <div className="adm-meter-bar" role="img" aria-label={present.map((s) => `${s.value} ${s.label}`).join(", ")}>
        {present.map((segment) => (
          <span
            key={segment.label}
            className={`adm-meter-seg tone-${segment.tone}`}
            style={{ flexGrow: segment.value }}
          />
        ))}
      </div>
      <ul className="adm-meter-keys">
        {segments.map((segment) => (
          <li key={segment.label} className={segment.value === 0 ? "is-zero" : ""}>
            <span className={`adm-dot tone-${segment.tone}`} aria-hidden />
            <span className="adm-meter-k">{segment.label}</span>
            <span className="adm-meter-v num">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
