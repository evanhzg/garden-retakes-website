import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getT } from "@/lib/serverI18n";
import { DEMO_ALLOWLIST, groupedSiteMap } from "@/lib/siteMap";
import { prisma } from "@/lib/db";
import OpenPaletteButton from "@/components/OpenPaletteButton";
import "./system.css";

export const metadata = { title: "Page not found" };

/**
 * The 404.
 *
 * Next's default is a white "404 | This page could not be found." with no way
 * forward but the back button. A dead link on a site with this many pages is
 * usually a renamed one, so the page offers the two ways to find it: search, and
 * the map of the site.
 */
export default async function NotFound() {
  const t = getT();
  // In a demo the map is the demo's pages only — the same rule as the rail and
  // the palette. A failed read shows the full map rather than no page at all.
  const demo = await prisma.gardenSchedulerState
    .findUnique({ where: { Key: "DemoMode" } })
    .then((r) => r?.Value === "true")
    .catch(() => false);
  const groups = groupedSiteMap()
    .map(({ group, entries }) => ({ group, entries: demo ? entries.filter((e) => DEMO_ALLOWLIST.includes(e.href)) : entries }))
    .filter(({ entries }) => entries.length > 0);
  return (
    <div className="sys">
      <div className="sys-hero">
        <span className="sys-code num" aria-hidden>404</span>
        <div>
          <span className="kicker">{t("sys.404.kicker")}</span>
          <h1 className="sys-title">{t("sys.404.title")}</h1>
          <p className="sys-lede">{t("sys.404.lede")}</p>
          <div className="sys-actions">
            <OpenPaletteButton label={t("sys.404.search")} />
            <Link className="btn btn-secondary" href="/">
              {t("sys.home")}
            </Link>
          </div>
        </div>
      </div>

      <nav className="sys-map" aria-label={t("sys.404.map")}>
        {groups.map(({ group, entries }) => (
          <section key={group.id}>
            <h2>{t(group.key)}</h2>
            <ul>
              {entries.map((entry) => (
                <li key={entry.href}>
                  <Link href={entry.href}>
                    <span className="sys-map-label">{t(entry.labelKey)}</span>
                    <span className="sys-map-desc">{t(entry.descKey)}</span>
                    <ArrowRight size={14} className="sys-map-arrow" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  );
}
