import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";

// The accent band, promoted from the homepage to the layout.
//
// It was the last section of one page and read as the end of the site, which is
// what a footer is — so it is one now, on every page, and nothing follows it.

export default function SiteFooter({ serverAddress }: { serverAddress: string }) {
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
            Climb the ladder.
            <br />
            Season 1 is up.
          </h3>
          <p className="site-footer-sub">Jump on the server — no sign-up, points count from your first round.</p>
        </div>

        <div className="site-footer-actions">
          <ConnectButton serverAddress={serverAddress} />
          <nav className="site-footer-links">
            <Link href="/stats">Stats</Link>
            <Link href="/feed">Feed</Link>
            <Link href="/utility">Utility</Link>
            <Link href="/docs">Docs</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
