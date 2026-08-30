import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";
import { prisma } from "@/lib/db";
import { isFrozen } from "@/lib/seasonFreeze";
import { getT } from '@/lib/serverI18n';

// The accent band, promoted from the homepage to the layout.
//
// It was the last section of one page and read as the end of the site, which is
// what a footer is — so it is one now, on every page, and nothing follows it.

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
  );
}
