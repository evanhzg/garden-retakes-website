"use client";

import { useEffect, useState } from "react";

export default function PageLoader() {
  const [show, setShow] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Loader always runs on reload now

    // Start fade out after 3 seconds
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 3000);

    // Completely unmount after fade out completes
    const removeTimer = setTimeout(() => {
      setShow(false);
    }, 3800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!show) return null;

  return (
    <div className={`page-loader-overlay ${fadeOut ? "fade-out" : ""}`}>
      <div className="page-loader-word">
        <span>R</span>
        <span>E</span>
        <span className="loader-e-extra" style={{ animationDelay: "0.15s" }}>E</span>
        <span className="loader-e-extra" style={{ animationDelay: "0.3s" }}>E</span>
        <span className="loader-e-extra" style={{ animationDelay: "0.45s" }}>E</span>
        <span className="loader-e-extra" style={{ animationDelay: "0.6s" }}>E</span>
        <span>T</span>
        <span>A</span>
        <span>K</span>
        <span>E</span>
        <span>S</span>
      </div>
    </div>
  );
}
