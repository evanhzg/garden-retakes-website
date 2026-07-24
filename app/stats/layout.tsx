"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <section className="panel">
        <h2>Global Stats Dashboard</h2>
        <div className="chip-row">
          <Link href="/stats" className={`chip ${pathname === "/stats" ? "active" : ""}`}>
            Overview
          </Link>
          <Link href="/stats/heatmaps" className={`chip ${pathname === "/stats/heatmaps" ? "active" : ""}`}>
            Map Heatmaps
          </Link>
          <Link href="/stats/seasons" className={`chip ${pathname === "/stats/seasons" ? "active" : ""}`}>
            Seasons History
          </Link>
          <Link href="/stats/compare" className={`chip ${pathname === "/stats/compare" ? "active" : ""}`}>
            Compare Players
          </Link>
        </div>
      </section>

      {children}
    </>
  );
}
