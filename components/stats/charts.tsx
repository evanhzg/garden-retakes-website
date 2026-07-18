// Pure-SVG chart primitives for the stats & compare pages.
// No hooks — usable from server AND client components. Colors come from the
// --chart-* CSS vars (validated for light+dark in globals.css); all text wears
// text tokens, never series colors. Native <title> supplies hover tooltips.

import React from "react";

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/* ---------- Vertical columns (activity over time) ---------- */
export function Columns({
  data,
  height = 120,
  color = "var(--chart-a)",
  valueSuffix = "",
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  color?: string;
  valueSuffix?: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.findIndex((d) => d.value === max);
  const barW = 100 / data.length;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="chart-columns" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(1.5, (d.value / max) * (height - 22));
          return (
            <g key={d.label}>
              <rect
                className="chart-col"
                x={i * barW + barW * 0.18}
                y={height - 14 - h}
                width={barW * 0.64}
                height={h}
                rx={1.5}
                fill={color}
                opacity={d.value === 0 ? 0.18 : 1}
              >
                <title>{`${d.label}: ${fmt(d.value)}${valueSuffix}${d.hint ? ` — ${d.hint}` : ""}`}</title>
              </rect>
              {i === maxIdx && d.value > 0 && (
                <text
                  x={i * barW + barW / 2}
                  y={height - 17 - h}
                  textAnchor="middle"
                  className="chart-value-label"
                >
                  {fmt(d.value)}
                </text>
              )}
            </g>
          );
        })}
        <line x1="0" y1={height - 13} x2="100" y2={height - 13} className="chart-baseline" />
      </svg>
      <div className="chart-x-labels">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

/* ---------- Horizontal bars (share / magnitude) ---------- */
export function HBars({
  rows,
  color = "var(--chart-a)",
  formatValue = fmt,
}: {
  rows: { label: string; value: number; hint?: string }[];
  color?: string;
  formatValue?: (v: number) => string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar-row" title={r.hint ?? `${r.label}: ${formatValue(r.value)}`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="hbar-value">{formatValue(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- T vs CT split bars (two-segment share) ---------- */
export function SideSplitBars({
  rows,
}: {
  rows: { label: string; tWinPct: number; ctWinPct: number; rounds: number }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="split-bars">
      <div className="chart-legend">
        <span className="legend-item"><i style={{ background: "var(--chart-t)" }} /> T round wins</span>
        <span className="legend-item"><i style={{ background: "var(--chart-ct)" }} /> CT round wins</span>
      </div>
      {rows.map((r) => {
        const t = Math.round(r.tWinPct);
        const ct = 100 - t;
        return (
          <div key={r.label} className="hbar-row" title={`${r.label}: T wins ${t}% · CT wins ${ct}% · ${r.rounds} rounds`}>
            <span className="hbar-label">{r.label}</span>
            <span className="split-track">
              <span className="split-t" style={{ width: `${t}%` }}>{t >= 14 ? `${t}%` : ""}</span>
              <span className="split-ct" style={{ width: `${ct}%` }}>{ct >= 14 ? `${ct}%` : ""}</span>
            </span>
            <span className="hbar-value muted-value">{r.rounds} rds</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Histogram (distribution) ---------- */
export function Histogram({
  buckets,
  color = "var(--chart-a)",
  height = 110,
}: {
  buckets: { label: string; count: number; hint?: string }[];
  color?: string;
  height?: number;
}) {
  if (buckets.length === 0) return null;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const barW = 100 / buckets.length;
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height, width: "100%" }}>
        {buckets.map((b, i) => {
          const h = Math.max(b.count > 0 ? 3 : 1, (b.count / max) * (height - 20));
          return (
            <rect
              key={b.label}
              className="chart-col"
              x={i * barW + barW * 0.12}
              y={height - 13 - h}
              width={barW * 0.76}
              height={h}
              rx={1.5}
              fill={color}
              opacity={b.count === 0 ? 0.18 : 0.4 + 0.6 * (b.count / max)}
            >
              <title>{`${b.label}: ${b.count}${b.hint ? ` — ${b.hint}` : ""}`}</title>
            </rect>
          );
        })}
        <line x1="0" y1={height - 12} x2="100" y2={height - 12} className="chart-baseline" />
      </svg>
      <div className="chart-x-labels spread">
        {buckets.map((b, i) => (i % 2 === 0 ? <span key={b.label}>{b.label}</span> : <span key={b.label} />))}
      </div>
    </div>
  );
}

/* ---------- Radar (A vs B, normalized axes) ---------- */
export function RadarCompare({
  axes,
  nameA,
  nameB,
}: {
  axes: { label: string; a: number; b: number }[]; // a/b already normalized 0..1
  nameA: string;
  nameB: string;
}) {
  const n = axes.length;
  if (n < 3) return null;
  const cx = 110, cy = 100, R = 72;
  const pt = (i: number, r: number) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r] as const;
  };
  const poly = (vals: number[]) =>
    vals.map((v, i) => pt(i, Math.max(0.04, Math.min(1, v)) * R).join(",")).join(" ");

  return (
    <div className="radar-wrap">
      <svg viewBox="0 0 220 200" className="radar-svg">
        {[0.33, 0.66, 1].map((g) => (
          <polygon key={g} points={poly(axes.map(() => g))} className="radar-grid" />
        ))}
        {axes.map((ax, i) => {
          const [x, y] = pt(i, R);
          const [lx, ly] = pt(i, R + 16);
          return (
            <g key={ax.label}>
              <line x1={cx} y1={cy} x2={x} y2={y} className="radar-grid" />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="radar-label">
                {ax.label}
              </text>
            </g>
          );
        })}
        <polygon points={poly(axes.map((ax) => ax.a))} className="radar-area radar-a" />
        <polygon points={poly(axes.map((ax) => ax.b))} className="radar-area radar-b" />
      </svg>
      <div className="chart-legend center">
        <span className="legend-item"><i style={{ background: "var(--chart-a)" }} /> {nameA}</span>
        <span className="legend-item"><i style={{ background: "var(--chart-b)" }} /> {nameB}</span>
      </div>
    </div>
  );
}

/* ---------- Two-line trend (rating over sessions) ---------- */
export function TrendCompare({
  points,
  nameA,
  nameB,
  height = 130,
}: {
  points: { label: string; a: number | null; b: number | null }[];
  nameA: string;
  nameB: string;
  height?: number;
}) {
  const usable = points.filter((p) => p.a !== null || p.b !== null);
  if (usable.length < 2) return null;

  const all = usable.flatMap((p) => [p.a, p.b]).filter((v): v is number => v !== null);
  const min = Math.min(...all, 0.6);
  const max = Math.max(...all, 1.4);
  const X = (i: number) => 6 + (i / (usable.length - 1)) * 88;
  const Y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (height - 30);

  const path = (key: "a" | "b") => {
    let d = "";
    usable.forEach((p, i) => {
      const v = p[key];
      if (v === null) return;
      d += d === "" ? `M ${X(i)} ${Y(v)}` : ` L ${X(i)} ${Y(v)}`;
    });
    return d;
  };

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height, width: "100%" }}>
        <line x1="6" y1={Y(1)} x2="94" y2={Y(1)} className="chart-refline" />
        <text x="95.5" y={Y(1) + 1} className="chart-value-label" dominantBaseline="middle">1.00</text>
        <path d={path("a")} className="trend-line trend-a" />
        <path d={path("b")} className="trend-line trend-b" />
        {usable.map((p, i) => (
          <g key={p.label}>
            {p.a !== null && (
              <circle cx={X(i)} cy={Y(p.a)} r={1.6} className="trend-dot trend-a-dot">
                <title>{`${p.label} — ${nameA}: ${p.a.toFixed(2)}`}</title>
              </circle>
            )}
            {p.b !== null && (
              <circle cx={X(i)} cy={Y(p.b)} r={1.6} className="trend-dot trend-b-dot">
                <title>{`${p.label} — ${nameB}: ${p.b.toFixed(2)}`}</title>
              </circle>
            )}
          </g>
        ))}
      </svg>
      <div className="chart-x-labels">
        <span>{usable[0].label}</span>
        <span>{usable[usable.length - 1].label}</span>
      </div>
      <div className="chart-legend center">
        <span className="legend-item"><i style={{ background: "var(--chart-a)" }} /> {nameA}</span>
        <span className="legend-item"><i style={{ background: "var(--chart-b)" }} /> {nameB}</span>
      </div>
    </div>
  );
}
