"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * RouteLoader – a slim, elegant progress bar that plays across the top of the
 * viewport during client-side navigations.  Inspired by NProgress but built
 * from scratch to stay in the project's design language (purple-indigo
 * gradient, smooth ease-out, subtle glow).
 *
 * It hooks into pathname changes via `usePathname()` — the only reliable
 * signal in Next.js App Router for detecting completed navigations.
 */
export default function RouteLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathname = useRef(pathname);
  const trickleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------------------------------------------------ */
  /* Intercept link clicks to START the bar before the route resolves    */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;

      // Same page — skip
      if (href === pathname) return;

      // Start the bar immediately on click
      startLoading();
    };

    // Also intercept programmatic navigations (e.g. router.push from wheel nav)
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      const url = args[2];
      if (url && String(url) !== pathname) {
        startLoading();
      }
      return originalPushState(...args);
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      history.pushState = originalPushState;
    };
  }, [pathname]);

  /* ------------------------------------------------------------------ */
  /* When pathname changes → route resolved → finish the bar            */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      finishLoading();
    }
  }, [pathname]);

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  const startLoading = () => {
    // Clear any pending hide
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    // Clear existing trickle
    if (trickleTimer.current) {
      clearInterval(trickleTimer.current);
    }

    setProgress(0);
    setVisible(true);
    setLoading(true);

    // Kick to 15% immediately, then trickle
    requestAnimationFrame(() => {
      setProgress(15);

      trickleTimer.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          // Slow down as we approach 90%
          const increment = prev < 40 ? 8 : prev < 60 ? 4 : prev < 80 ? 2 : 0.5;
          return Math.min(prev + increment, 90);
        });
      }, 300);
    });
  };

  const finishLoading = () => {
    if (trickleTimer.current) {
      clearInterval(trickleTimer.current);
      trickleTimer.current = null;
    }

    // Snap to 100%
    setProgress(100);
    setLoading(false);

    // Fade out after the bar reaches full width
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      // Reset progress after fade-out completes
      setTimeout(() => setProgress(0), 300);
    }, 400);
  };

  if (!visible && progress === 0) return null;

  return (
    <div
      className={`route-loader ${visible ? "" : "route-loader--done"}`}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="route-loader__bar"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
