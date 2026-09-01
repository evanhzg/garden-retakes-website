import Link from "next/link";
import { ArrowRight, Crosshair } from "lucide-react";

import { getT } from "@/lib/serverI18n";
import "./duels.css";

export const metadata = {
  title: "Duels — Garden Retakes",
  description: "1v1 duels are coming to the Blitz circuit.",
};

/**
 * Duels, held back.
 *
 * There WAS a page here: a full 1v1 ladder reading from GardenDuels, with
 * win/loss, winrate and challenge records. It worked, and it is in the git
 * history at this path — this is a deliberate hold, not a deletion, and
 * restoring it is a revert rather than a rebuild.
 *
 * The hold is because the mode is on the rail now. A link that leads to a
 * ladder with nothing in it teaches people the feature is dead; a page that
 * says when it is coming teaches them it is not. So the nav entry is dimmed
 * and this page says so in as many words.
 *
 * Static: no session, no database, nothing to reconcile. It should render if
 * everything else is down.
 */
export default function DuelsPage() {
  const t = getT();

  return (
    <section className="dz">
      <div className="dz-inner">
        <span className="dz-kicker">
          <Crosshair size={13} />
          {t("duels.kicker")}
        </span>

        {/* Same two-face treatment as the homepage: the statement in the
            grotesque, the name in the serif. */}
        <h1 className="dz-title">
          {t("duels.title1")}
          <br />
          <em className="dz-title-serif">{t("duels.title2")}</em>
        </h1>

        <p className="dz-lead">{t("duels.lead")}</p>

        {/* What it will be, stated plainly. A coming-soon page with nothing on
            it but the words "coming soon" is a dead end with better manners;
            these are the three things somebody would want to know. */}
        <ul className="dz-points">
          <li>
            <span className="dz-point-n">01</span>
            <span>{t("duels.point1")}</span>
          </li>
          <li>
            <span className="dz-point-n">02</span>
            <span>{t("duels.point2")}</span>
          </li>
          <li>
            <span className="dz-point-n">03</span>
            <span>{t("duels.point3")}</span>
          </li>
        </ul>

        {/* Somewhere to go. The one thing a page like this must not be is a
            terminus. */}
        <div className="dz-cta">
          <Link className="dz-btn primary" href="/lobby">
            {t("duels.ctaPlay")}
            <ArrowRight size={16} />
          </Link>
          <Link className="dz-btn" href="/tournaments">
            {t("duels.ctaTournaments")}
          </Link>
        </div>
      </div>

      {/* The mark, oversized and cropped by the panel. Decoration that costs
          one element and no images. */}
      <Crosshair className="dz-ghost" aria-hidden strokeWidth={0.6} />
    </section>
  );
}
