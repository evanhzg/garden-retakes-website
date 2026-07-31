"use client";

import { useEffect, useRef, useState } from "react";

export type RadarPoint = { label: string; score: number };

/**
 * Five-axis category radar.
 *
 * preserveAspectRatio is left at its default here on purpose — this SVG holds
 * text, and the stats charts that force it to "none" are exactly why a figure
 * on this page once rendered horizontally smeared.
 */
export default function CategoryRadar({ points, size = 260 }: { points: RadarPoint[]; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(1);
      return;
    }
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / 800, 1);
        setT(1 - Math.pow(1 - p, 3));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 46;
  const n = points.length || 1;

  const at = (i: number, radius: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius] as const;
  };

  const poly = points
    .map((p, i) => at(i, r * (Math.max(4, p.score) / 100) * t).join(","))
    .join(" ");

  return (
    <svg ref={ref} viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((step) => (
        <polygon
          key={step}
          points={points.map((_, i) => at(i, r * step).join(",")).join(" ")}
          fill="none"
          stroke="var(--color-divider)"
          strokeWidth={step === 1 ? 2 : 1}
        />
      ))}
      {points.map((_, i) => {
        const [x, y] = at(i, r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-divider)" strokeWidth={1} />;
      })}

      <polygon
        points={poly}
        fill="color-mix(in srgb, var(--color-accent) 22%, transparent)"
        stroke="var(--color-accent)"
        strokeWidth={2}
      />

      {points.map((p, i) => {
        const [x, y] = at(i, r + 22);
        return (
          <text
            key={p.label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: 11, fill: "var(--color-text)", fontWeight: 600, letterSpacing: "0.06em" }}
          >
            {p.label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}
