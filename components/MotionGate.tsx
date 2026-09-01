"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";

/**
 * One place that decides whether framer animates.
 *
 * The site has had a motion preference for a long time — MotionToggle writes
 * `data-motion="full" | "off"` on <html>, or removes it to mean "follow the
 * OS" — and globals.css honours it in about a dozen hand-written rules of the
 * shape `html[data-motion="off"] .thing { animation: none }`.
 *
 * Framer never saw any of it. Twenty-four components animate through framer,
 * every one of them with its own `transition`, and a visitor who turned motion
 * off got a site that still moved everywhere it mattered — the drawer, the
 * docks, the lobby stages, the kill feed. The CSS rules covered the surfaces
 * that happened to be CSS.
 *
 * MotionConfig is framer's own answer to this and it is a context: setting
 * `reducedMotion` here applies it to every motion component below, including
 * ones written later that never think about it. So the rule is stated once:
 *
 *   off    → "always" reduce. Framer keeps transforms and opacity at their
 *            end state and skips the tween.
 *   full   → "never" reduce, which is what the toggle means by On — it exists
 *            because Windows' "animation effects: off" sets the OS flag and
 *            some visitors want to disagree with it.
 *   system → "user", framer's own reading of prefers-reduced-motion.
 *
 * The attribute is applied by an inline script in layout.tsx before first
 * paint, so the first read here is already the right one; the observer is for
 * the toggle being used while the page is open.
 */
export default function MotionGate({ children }: { children: React.ReactNode }) {
  const [pref, setPref] = useState<"always" | "never" | "user">("user");

  useEffect(() => {
    const read = () => {
      const v = document.documentElement.getAttribute("data-motion");
      setPref(v === "off" ? "always" : v === "full" ? "never" : "user");
    };
    read();

    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributeFilter: ["data-motion"] });
    return () => obs.disconnect();
  }, []);

  return <MotionConfig reducedMotion={pref}>{children}</MotionConfig>;
}
