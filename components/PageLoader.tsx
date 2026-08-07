"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * PageLoader – full-screen intro that morphs the centred "REEEETAKES" text
 * directly into the header's .brand-word position for a seamless handoff.
 *
 * Phases:
 *   entrance  → letters type-in while centred (0 – 0.5 s)
 *   hold      → brief pause at full size        (0.5 – 0.7 s)
 *   travel    → text flies to header position    (0.7 – 1.2 s)
 *   settle    → overlay fades out, header takes over (1.2 – 1.5 s)
 */
export default function PageLoader() {
  const [phase, setPhase] = useState<
    "entrance" | "hold" | "travel" | "settle" | "done"
  >("entrance");
  const wordRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------ */
  /* Measure the header's .brand-word at travel-start and apply a       */
  /* transform so the loader text lands exactly on top of it.           */
  /* ------------------------------------------------------------------ */
  const flyToHeader = useCallback(() => {
    const loaderWord = wordRef.current;
    if (!loaderWord) return;

    // Where is the header's brand-word?
    const headerBrand = document.querySelector(
      ".site-header .brand-word"
    ) as HTMLElement | null;

    if (headerBrand) {
      const target = headerBrand.getBoundingClientRect();
      const source = loaderWord.getBoundingClientRect();

      // Scale ratio based on the height of both elements
      const scale = target.height / source.height;

      // Translate so the top-left of the scaled loader word matches the
      // top-left of the header brand-word.
      const tx = target.left - source.left - (source.width * (1 - scale)) / 2;
      const ty = target.top - source.top - (source.height * (1 - scale)) / 2;

      loaderWord.style.transition =
        "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
      loaderWord.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    } else {
      // Fallback: fly to typical top-left position
      loaderWord.style.transition =
        "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
      loaderWord.style.transform = "translate(-40vw, -40vh) scale(0.25)";
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Phase timeline                                                      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    document.body.classList.add("is-loading-page");
    const timers: ReturnType<typeof setTimeout>[] = [];

    // entrance → hold
    timers.push(setTimeout(() => setPhase("hold"), 500));

    // hold → travel (kick off the FLIP)
    timers.push(
      setTimeout(() => {
        setPhase("travel");
        flyToHeader();
      }, 700)
    );

    // travel → settle
    timers.push(setTimeout(() => setPhase("settle"), 1200));

    // settle → done (unmount)
    timers.push(setTimeout(() => {
      setPhase("done");
      document.body.classList.remove("is-loading-page");
    }, 1500));

    return () => {
      timers.forEach(clearTimeout);
      document.body.classList.remove("is-loading-page");
    };
  }, [flyToHeader]);

  if (phase === "done") return null;


  return (
    <div
      ref={overlayRef}
      className={`page-loader-overlay ${phase}`}
    >
      {/* Subtle radial glow behind the text during entrance/hold */}
      <div className="loader-glow" />

      <div ref={wordRef} className="page-loader-word">
        <span style={{ animationDelay: "0s" }}>R</span>
        <span style={{ animationDelay: "0.04s" }}>E</span>
        <span style={{ animationDelay: "0.08s" }}>T</span>
        <span style={{ animationDelay: "0.12s" }}>A</span>
        <span style={{ animationDelay: "0.16s" }}>K</span>
        <span style={{ animationDelay: "0.20s" }}>E</span>
        <span style={{ animationDelay: "0.24s" }}>S</span>
      </div>
    </div>
  );
}
