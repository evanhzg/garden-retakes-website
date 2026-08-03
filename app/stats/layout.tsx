"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <>
      <section className="panel">
        <h2>{t("stats.layout.title")}</h2>
        <div className="chip-row">
          <Link href="/stats" className={`chip ${pathname === "/stats" ? "active" : ""}`}>
            {t("stats.layout.overview")}
          </Link>
          {/* Greyed out pending a rebuild — a tab that opens something known to
              be wrong is worse than a tab that says it is coming. */}
          <span className="chip is-disabled" aria-disabled="true" title={t("stats.layout.beingRebuilt")}>
            {t("stats.layout.mapHeatmaps")}
          </span>
          <Link href="/stats/seasons" className={`chip ${pathname === "/stats/seasons" ? "active" : ""}`}>
            {t("stats.layout.seasonsHistory")}
          </Link>
          <Link href="/stats/compare" className={`chip ${pathname === "/stats/compare" ? "active" : ""}`}>
            {t("stats.layout.comparePlayers")}
          </Link>
        </div>
      </section>

      {children}
    </>
  );
}
