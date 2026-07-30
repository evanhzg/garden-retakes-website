"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function DynamicGridBackground() {
  // The hub is a vitrine for the games — it wants the same live ground as the
  // rest of the site, so the grid renders there too. It used to bail on /games.
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    // Config
    const GRID_SIZE = 20;
    const LENS_RADIUS = 300;
    const MAGNIFICATION = 0.8; // Strength of the bulge/zoom

    // Read the live theme so the grid follows the palette instead of hardcoding
    // it — this is what kept the old purple around after the restyle.
    const css = getComputedStyle(document.documentElement);
    const rgb = (v: string, fallback: string) => {
      const hex = (css.getPropertyValue(v) || fallback).trim() || fallback;
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return m
        ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
        : [255, 77, 28];
    };
    const [r, g, b] = rgb("--accent", "#d93d0b");
    const [ir, ig, ib] = rgb("--muted", "#6f6758");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let mouseX = -1000;
    let mouseY = -1000;
    let targetMouseX = -1000;
    let targetMouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const draw = () => {
      // Smooth tracking
      mouseX += (targetMouseX - mouseX) * 0.12;
      mouseY += (targetMouseY - mouseY) * 0.12;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const cols = Math.ceil(canvas.width / GRID_SIZE) + 1;
      const rows = Math.ceil(canvas.height / GRID_SIZE) + 1;

      // 1. Calculate distorted points
      const points: {x: number, y: number}[][] = [];

      for (let i = 0; i <= rows; i++) {
        const row: {x: number, y: number}[] = [];
        for (let j = 0; j <= cols; j++) {
          const base_x = j * GRID_SIZE;
          const base_y = i * GRID_SIZE;
          
          const dx = base_x - mouseX;
          const dy = base_y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          let distorted_x = base_x;
          let distorted_y = base_y;

          if (dist < LENS_RADIUS) {
            // Push points away to create a zoom/magnify effect
            const force = Math.pow(1 - dist / LENS_RADIUS, 2);
            distorted_x += dx * force * MAGNIFICATION;
            distorted_y += dy * force * MAGNIFICATION;
          }
          row.push({ x: distorted_x, y: distorted_y });
        }
        points.push(row);
      }

      // 2. Draw the grid lines
      ctx.beginPath();
      // Horizontal lines
      for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
          if (j === 0) ctx.moveTo(points[i][j].x, points[i][j].y);
          else ctx.lineTo(points[i][j].x, points[i][j].y);
        }
      }
      // Vertical lines
      for (let j = 0; j <= cols; j++) {
        for (let i = 0; i <= rows; i++) {
          if (i === 0) ctx.moveTo(points[i][j].x, points[i][j].y);
          else ctx.lineTo(points[i][j].x, points[i][j].y);
        }
      }
      
      // Ink-neutral rules; the accent is spent only inside the lens, so the
      // colour reads as a response to the cursor rather than a background wash.
      ctx.strokeStyle = `rgba(${ir}, ${ig}, ${ib}, 0.16)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Add a subtle ambient glow over the lens
      const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, LENS_RADIUS * 0.8);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.13)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationFrameId = requestAnimationFrame(draw);
    };

    // Reduced motion still gets the grid, just static and un-lensed.
    if (reduced) {
      targetMouseX = -10000;
      targetMouseY = -10000;
      mouseX = -10000;
      mouseY = -10000;
      window.removeEventListener("mousemove", handleMouseMove);
    }

    draw();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [pathname]);

  return (
    <canvas 
      ref={canvasRef}
      style={{
        pointerEvents: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
      }}
    />
  );
}
