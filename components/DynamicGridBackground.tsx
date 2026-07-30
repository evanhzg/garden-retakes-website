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
    <div className="pointer-events-none fixed inset-0 z-[-2] overflow-hidden">
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]" />
      
      {/* Lens Effect */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, rgba(168, 85, 247, 0.12), transparent 80%)`,
        }}
      />
    </div>
  );
}
