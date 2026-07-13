"use client";

import React from "react";

export type GardenPopConfig = {
  base: string;
  hair: string;
  clothes: string;
  eyewear: string;
};

export const defaultPopConfig: GardenPopConfig = {
  base: "light",
  hair: "none",
  clothes: "tshirt",
  eyewear: "none",
};

// --- SVG Layer Dictionaries ---

const BaseLayers: Record<string, React.ReactNode> = {
  light: (
    <>
      {/* Body */}
      <rect x="70" y="140" width="60" height="60" rx="10" fill="#fcdbb4" />
      {/* Head */}
      <rect x="40" y="20" width="120" height="110" rx="30" fill="#fcdbb4" />
      {/* Funko Eyes */}
      <circle cx="70" cy="80" r="12" fill="#000" />
      <circle cx="130" cy="80" r="12" fill="#000" />
      {/* Nose */}
      <path d="M 95 95 Q 100 100 105 95" stroke="#e0b88d" strokeWidth="3" fill="none" />
    </>
  ),
  medium: (
    <>
      <rect x="70" y="140" width="60" height="60" rx="10" fill="#c68642" />
      <rect x="40" y="20" width="120" height="110" rx="30" fill="#c68642" />
      <circle cx="70" cy="80" r="12" fill="#000" />
      <circle cx="130" cy="80" r="12" fill="#000" />
      <path d="M 95 95 Q 100 100 105 95" stroke="#9e6224" strokeWidth="3" fill="none" />
    </>
  ),
  dark: (
    <>
      <rect x="70" y="140" width="60" height="60" rx="10" fill="#8d5524" />
      <rect x="40" y="20" width="120" height="110" rx="30" fill="#8d5524" />
      <circle cx="70" cy="80" r="12" fill="#000" />
      <circle cx="130" cy="80" r="12" fill="#000" />
      <path d="M 95 95 Q 100 100 105 95" stroke="#5a3111" strokeWidth="3" fill="none" />
    </>
  ),
};

const HairLayers: Record<string, React.ReactNode> = {
  none: null,
  spiky: (
    <path
      d="M 35 60 Q 40 10 100 10 Q 160 10 165 60 L 150 40 L 140 50 L 120 20 L 100 40 L 80 15 L 60 40 L 50 30 Z"
      fill="#2c3e50"
    />
  ),
  fade: (
    <path
      d="M 35 60 Q 40 10 100 10 Q 160 10 165 60 L 160 30 Q 100 15 40 30 Z"
      fill="#000000"
    />
  ),
  long: (
    <path
      d="M 35 120 Q 20 20 100 10 Q 180 20 165 120 L 150 70 Q 100 20 50 70 Z"
      fill="#e67e22"
    />
  ),
};

const ClothesLayers: Record<string, React.ReactNode> = {
  tshirt: (
    <>
      <rect x="65" y="138" width="70" height="40" rx="8" fill="#3498db" />
      <rect x="55" y="140" width="20" height="25" rx="5" fill="#3498db" transform="rotate(-15 65 140)" />
      <rect x="125" y="140" width="20" height="25" rx="5" fill="#3498db" transform="rotate(15 135 140)" />
    </>
  ),
  hoodie: (
    <>
      <rect x="62" y="135" width="76" height="50" rx="10" fill="#e74c3c" />
      <rect x="52" y="135" width="25" height="35" rx="8" fill="#e74c3c" transform="rotate(-10 62 135)" />
      <rect x="123" y="135" width="25" height="35" rx="8" fill="#e74c3c" transform="rotate(10 138 135)" />
      {/* Hoodie strings */}
      <line x1="90" y1="135" x2="85" y2="160" stroke="#fff" strokeWidth="2" />
      <line x1="110" y1="135" x2="115" y2="160" stroke="#fff" strokeWidth="2" />
    </>
  ),
  suit: (
    <>
      <rect x="65" y="138" width="70" height="45" rx="5" fill="#2c3e50" />
      {/* White shirt triangle */}
      <polygon points="80,138 120,138 100,165" fill="#fff" />
      {/* Red Tie */}
      <polygon points="97,145 103,145 100,180" fill="#c0392b" />
      {/* Sleeves */}
      <rect x="55" y="140" width="20" height="35" rx="3" fill="#2c3e50" transform="rotate(-5 65 140)" />
      <rect x="125" y="140" width="20" height="35" rx="3" fill="#2c3e50" transform="rotate(5 135 140)" />
    </>
  ),
};

const EyewearLayers: Record<string, React.ReactNode> = {
  none: null,
  glasses: (
    <>
      <rect x="55" y="65" width="30" height="30" rx="5" fill="none" stroke="#2c3e50" strokeWidth="4" />
      <rect x="115" y="65" width="30" height="30" rx="5" fill="none" stroke="#2c3e50" strokeWidth="4" />
      <line x1="85" y1="80" x2="115" y2="80" stroke="#2c3e50" strokeWidth="4" />
    </>
  ),
  sunglasses: (
    <>
      <rect x="55" y="65" width="32" height="25" rx="4" fill="#000" />
      <rect x="113" y="65" width="32" height="25" rx="4" fill="#000" />
      <line x1="87" y1="75" x2="113" y2="75" stroke="#000" strokeWidth="6" />
    </>
  ),
};

export default function GardenPop({
  config,
  className,
}: {
  config: GardenPopConfig;
  className?: string;
}) {
  return (
    <div className={`garden-pop-container ${className || ""}`} style={{ position: "relative", width: "100%", height: "100%", maxWidth: "300px", aspectRatio: "1/1" }}>
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.5))" }}
      >
        {/* Render Layers Bottom to Top */}
        <g id="layer-base">{BaseLayers[config.base] || BaseLayers.light}</g>
        <g id="layer-clothes">{ClothesLayers[config.clothes] || ClothesLayers.tshirt}</g>
        <g id="layer-hair">{HairLayers[config.hair] || HairLayers.none}</g>
        <g id="layer-eyewear">{EyewearLayers[config.eyewear] || EyewearLayers.none}</g>
      </svg>
    </div>
  );
}
