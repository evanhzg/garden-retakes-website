import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";
import OpenPaletteButton from "@/components/OpenPaletteButton";
import { prisma } from "@/lib/db";
import { isFrozen } from "@/lib/seasonFreeze";
import { getT } from '@/lib/serverI18n';
import { groupedSiteMap } from "@/lib/siteMap";
import "./site-footer.css";

// The accent band, promoted from the homepage to the layout.
//
// It was the last section of one page and read as the end of the site, which is
// what a footer is — so it is one now, on every page, and nothing follows it.
//
// Nothing but the site map, that is. The band had three links, so every page
// the rail does not show was reachable only by knowing its URL. The map under
// it is drawn from lib/siteMap.ts — the same list the command palette searches
// and /sitemap.xml publishes — so a new page is added in one place.

export default async function SiteFooter({ serverAddress }: { serverAddress: string }) {
    const t = getT();
    const now = new Date();
    const poll = await prisma.gardenVotePoll.findFirst({
      where: { ClosesAt: { gt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30) } },
      orderBy: { Id: "desc" },
    });
    const freezePoll = poll ? { closesAt: poll.ClosesAt.toISOString(), open: now >= poll.OpensAt && now < poll.ClosesAt } : null;
    const frozen = isFrozen(freezePoll);

  return (
    <div className="site-footer-wrap">
    <footer
      className="full-bleed full-bleed-inset site-footer-band"
      style={{
        background: "var(--color-accent)",
        color: "var(--color-bg)",
        paddingBlock: "clamp(44px, 6vw, 80px)",
      }}
    >
      <div className="site-footer-inner">
        <div>
          <h3 className="site-footer-title">
            {t("auto.sitefooter.climb_the_ladder")}
            <br />
            {frozen ? t("auto.sitefooter.inter_season") : t("auto.sitefooter.season_2_is_live")}
                                </h3>
          <p className="site-footer-sub">{t("auto.sitefooter.jump_on_the_server_no_sign_up")}</p>
        </div>

        <div className="site-footer-actions">
          <ConnectButton serverAddress={serverAddress} />
          <nav className="site-footer-links">
            <Link href="/stats">{t("auto.sitefooter.stats")}</Link>
            <Link href="/feed">{t("auto.sitefooter.feed")}</Link>
            <Link href="/utility">{t("auto.sitefooter.utility")}</Link>
          </nav>
        </div>
      </div>
    </footer>

    <div className="full-bleed full-bleed-inset site-footer-map">
      <div className="site-footer-map-grid">
        <div className="site-footer-brand">
          <Link href="/" className="site-footer-mark">REEEETAKES</Link>
          <p>{t("site.footer.tagline")}</p>
          <code className="site-footer-address num">{serverAddress}</code>
          <OpenPaletteButton label={t("site.footer.search")} className="btn btn-secondary site-footer-search" />
        </div>

        {groupedSiteMap().map(({ group, entries }) => (
          <nav key={group.id} className="site-footer-col" aria-label={t(group.key)}>
            <h4>{t(group.key)}</h4>
            <ul>
              {entries.map((entry) => (
                <li key={entry.href}>
                  <Link href={entry.href}>{t(entry.labelKey)}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="site-footer-legal">
        <span>© {now.getFullYear()} REEEETAKES</span>
        <span>{t("site.footer.valve")}</span>
      </div>
    </div>
    </div>
  );
}
