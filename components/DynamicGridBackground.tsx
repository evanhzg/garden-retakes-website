"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "framer-motion";

export default function DynamicGridBackground() {
  const pathname = usePathname();
  const isGames = pathname.startsWith("/games");

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Check if mouse is hovering an interactive element (a, button, input)
      // or an element with a background that should block the lens.
      const target = e.target as HTMLElement;
      const isInteractive = target.closest("a, button, input, [role='button'], .glass-panel");
      
      if (!isInteractive) {
        mouseX.set(e.clientX);
        mouseY.set(e.clientY);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const smoothX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  const bgXBase = useTransform(smoothX, (v) => `${v * -0.02}px`);
  const bgYBase = useTransform(smoothY, (v) => `${v * -0.02}px`);

  const bgXZoom = useTransform(smoothX, (v) => `${v * -0.06}px`);
  const bgYZoom = useTransform(smoothY, (v) => `${v * -0.06}px`);

  if (isGames) return null;

  return (
    <div style={{ pointerEvents: 'none', position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: -1, overflow: 'hidden' }}>
      {/* Base Grid Pattern */}
      <motion.div 
        style={{
          position: 'absolute',
          top: -100, right: -100, bottom: -100, left: -100,
          backgroundImage: 'linear-gradient(to right, rgba(168, 85, 247, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(168, 85, 247, 0.15) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          x: bgXBase,
          y: bgYBase
        }} 
      />
      
      {/* Zoomed/Distorted Grid Lens */}
      <motion.div
        style={{
          position: 'absolute',
          top: -100, right: -100, bottom: -100, left: -100,
          backgroundImage: 'linear-gradient(to right, rgba(168, 85, 247, 0.4) 2px, transparent 2px), linear-gradient(to bottom, rgba(168, 85, 247, 0.4) 2px, transparent 2px)',
          backgroundSize: '40px 40px',
          x: bgXZoom,
          y: bgYZoom,
          WebkitMaskImage: useMotionTemplate`radial-gradient(350px circle at calc(${mouseX}px + 100px) calc(${mouseY}px + 100px), black 0%, transparent 100%)`,
          maskImage: useMotionTemplate`radial-gradient(350px circle at calc(${mouseX}px + 100px) calc(${mouseY}px + 100px), black 0%, transparent 100%)`,
        }}
      />
    </div>
  );
}
