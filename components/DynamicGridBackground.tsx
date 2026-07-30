"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function DynamicGridBackground() {
  const pathname = usePathname();
  const isGames = pathname?.startsWith("/games");
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
      
      ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Add a subtle ambient glow over the lens
      const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, LENS_RADIUS * 0.8);
      gradient.addColorStop(0, "rgba(168, 85, 247, 0.15)");
      gradient.addColorStop(1, "rgba(168, 85, 247, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  if (isGames) return null;

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
