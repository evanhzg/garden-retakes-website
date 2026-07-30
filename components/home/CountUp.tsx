"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a figure up when it scrolls into view.
 *
 * Runs on rAF against elapsed time rather than a fixed per-frame step, so the
 * duration holds regardless of refresh rate. Honours prefers-reduced-motion by
 * rendering the final value immediately.
 */
export default function CountUp({
  value,
  decimals = 0,
  suffix = "",
  duration = 900,
  className,
  style,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || done.current) return;
        done.current = true;
        io.disconnect();

        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          // easeOutCubic — fast out of the gate, settles rather than stops.
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(value * eased);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
