"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";

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

  if (isGames) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[-2] overflow-hidden bg-[var(--bg)]">
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0" 
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(168, 85, 247, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(168, 85, 247, 0.1) 1px, transparent 1px)',
          backgroundSize: '100px 100px'
        }} 
      />
      
      {/* Lens Effect */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: useMotionTemplate`radial-gradient(500px circle at ${mouseX}px ${mouseY}px, rgba(168, 85, 247, 0.15), transparent 80%)`,
        }}
      />
    </div>
  );
}
