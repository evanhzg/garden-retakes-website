import Link from "next/link";
import { getT } from "@/lib/serverI18n";

// What changed in Season 2's scoring, on the homepage.
//
// The full derivation lives in the explainer on /stats, which is the right
// place for it and the wrong place to announce it: that panel is collapsed by
// default and sits under six tables, so a player who does not already know the
// rules moved will never open it. This section is the announcement — one line
// per change, no algebra — and it ends at the link to the page that does carry
// the algebra.
//
// One line each is a deliberate ceiling rather than all that would fit. A
// visitor scrolling a landing page is deciding whether to care, not learning a
// formula, and five short lines get read where five paragraphs get skipped.
//
// This is a temporary block. When Season 2 stops being news it is removed from
// app/page.tsx and deleted, along with the styles at the foot of globals.css
// that dress it; nothing else in the page depends on it.
//
// No client boundary: nothing here reacts to anything, and a block that exists
// to be read on first paint should not cost a hydration payload.

type Change = {
  /** Dictionary keys; the copy itself lives in locales so it can be translated. */
  termKey: string;
  lineKey: string;
  // Plain Unicode from the Arrows, Geometric Shapes and Punctuation blocks
  // rather than an icon set, because a strict CSP blocks external requests and
  // an icon library would be several kilobytes of JavaScript for five glyphs.
  glyph: string;
};

const CHANGES: readonly Change[] = [
  // Ordered by how soon a player meets the change, not by how large it is. The
  // Elo swing is felt in the first session; the season-end freeze is felt once
  // a year, so it goes last even though it is the most absolute rule here.
  { termKey: "home.season2.elo.term", lineKey: "home.season2.elo.line", glyph: "↕" },
  { termKey: "home.season2.map.term", lineKey: "home.season2.map.line", glyph: "◎" },
  { termKey: "home.season2.calibration.term", lineKey: "home.season2.calibration.line", glyph: "○" },
  { termKey: "home.season2.daily.term", lineKey: "home.season2.daily.line", glyph: "◷" },
  { termKey: "home.season2.global.term", lineKey: "home.season2.global.line", glyph: "∞" },
  { termKey: "home.season2.freeze.term", lineKey: "home.season2.freeze.line", glyph: "‖" },
];

export default function SeasonTwo() {
  const t = getT();

  return (
    <section className="home-block season2-wrapper" aria-labelledby="season2-heading">
      <header className="home-block-head">
        <span className="kicker">{t("home.season2.kicker")}</span>
        <h2 id="season2-heading">{t("home.season2.title")}</h2>
        <Link href="/stats#how" className="btn btn-secondary">
          {t("home.season2.cta")}
        </Link>
      </header>

      <p className="home-block-lead">{t("home.season2.lead")}</p>

      <ul className="season2-grid">
        {CHANGES.map((c) => (
          <li key={c.termKey} className="season2-item">
            {/* Decorative: the mark restates the heading at best, and a screen
                reader announcing "double vertical line" before "Seasons end on
                the vote" would be five pieces of noise. */}
            <span className="season2-glyph" aria-hidden>
              {c.glyph}
            </span>
            <h3 className="season2-term">{t(c.termKey)}</h3>
            <p className="season2-line">{t(c.lineKey)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
