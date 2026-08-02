"use client";

import { useEffect, useState } from "react";

// Lets a visitor override the OS "reduce motion" setting in either direction.
//
// Windows' "Animation effects: off" sets prefers-reduced-motion, Edge honours
// it, and the site then had no motion at all with nothing on the page to say
// why or to change it. The OS preference is still the default — this only adds
// a way to disagree with it.

export type MotionPref = "system" | "full" | "off";

const KEY = "garden_motion";

/** Applied to <html> so the CSS in globals.css can key off it. */
export function applyMotion(pref: MotionPref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", pref);
}

export function readMotion(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "full" || v === "off" ? v : "system";
  } catch {
    return "system";
  }
}

const OPTIONS: { id: MotionPref; label: string; title: string }[] = [
  { id: "system", label: "Auto", title: "Follow your system's reduce-motion setting" },
  { id: "full", label: "On", title: "Always animate, even if your system asks for reduced motion" },
  { id: "off", label: "Off", title: "Never animate" },
];

export default function MotionToggle() {
  const [pref, setPref] = useState<MotionPref>("system");
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    setPref(readMotion());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReduced(mq.matches);
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (next: MotionPref) => {
    setPref(next);
    applyMotion(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode — the choice just won't survive a reload.
    }
    // The canvas reads the same preference and has to be told it changed.
    window.dispatchEvent(new CustomEvent("garden:motion", { detail: next }));
  };

  return (
    <div className="motion-toggle">
      <span className="motion-toggle-k">Motion</span>
      <div className="seg" role="group" aria-label="Motion preference">
        {OPTIONS.map((o) => (
          <label key={o.id} className="seg-opt" title={o.title}>
            <input
              type="radio"
              name="motion"
              checked={pref === o.id}
              onChange={() => choose(o.id)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {pref === "system" && systemReduced && (
        <p className="motion-toggle-hint">
          Your system asks for reduced motion, so animations are off. Choose <strong>On</strong> to override it.
        </p>
      )}
    </div>
  );
}
