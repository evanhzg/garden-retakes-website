"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-reveal wrapper. Adds `gr-in` once the element enters the viewport,
 * which the .gr-reveal / .gr-line transitions in globals.css key off.
 *
 * Reveals once and then disconnects — re-animating on every scroll past is
 * noise, not feedback.
 */
export default function Reveal({
  children,
  as: Tag = "div",
  variant = "block",
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  as?: "div" | "section" | "span" | "li" | "tr";
  variant?: "block" | "line";
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Anything already on screen at mount reveals immediately rather than
    // waiting for a scroll that may never come on a short page.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const base = variant === "line" ? "gr-line" : "gr-reveal";
  return (
    <Tag
      ref={ref as never}
      className={`${base}${shown ? " gr-in" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: delay ? `${delay}s` : undefined, ...style }}
    >
      {children}
    </Tag>
  );
}
