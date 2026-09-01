"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, GitCompare, Map, TrendingUp, History } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./stats-nav.css";

/**
 * The sub-nav over every /stats page.
 *
 * It was five filled chips in a bordered panel under a heading that read
 * "Title" — the literal placeholder string, in both dictionaries, shipped and
 * live. Five buttons of the same weight as the page's real actions, competing
 * with them, above a heading that said nothing.
 *
 * It is a rail laid on its side now: icon and word, a 2px accent flag under
 * whichever is current, and no filled surface anywhere — the same vocabulary
 * as the two rails down the edges of every page, which is what "coherent" has
 * to mean if it means anything.
 */
const LINKS = [
  { href: "/stats", key: "stats.layout.overview", icon: BarChart3 },
  { href: "/stats/form", key: "stats.layout.recentForm", icon: TrendingUp },
  { href: "/stats/seasons", key: "stats.layout.seasonsHistory", icon: History },
  { href: "/stats/compare", key: "stats.layout.comparePlayers", icon: GitCompare },
] as const;

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <>
      <nav className="stats-rail" aria-label={t("stats.layout.navLabel")}>
        {LINKS.map((l) => {
          const on = pathname === l.href;
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} className={`stats-rail-btn ${on ? "on" : ""}`}>
              <Icon size={14} />
              <span>{t(l.key)}</span>
              {on && (
                <motion.span
                  className="stats-rail-mark"
                  layoutId="statsRailMark"
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                />
              )}
            </Link>
          );
        })}

        {/* Greyed out pending a rebuild — a tab that opens something known to
            be wrong is worse than a tab that says it is coming. */}
        <span className="stats-rail-btn is-soon" aria-disabled="true" title={t("stats.layout.beingRebuilt")}>
          <Map size={14} />
          <span>{t("stats.layout.mapHeatmaps")}</span>
        </span>
      </nav>

      {children}
    </>
  );
}
