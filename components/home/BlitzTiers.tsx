"use client";

import { useI18n } from "@/components/I18nProvider";

/**
 * The Blitz Tier ladder, explained.
 *
 * Deliberately not another numbered two-column module. Every other block on this
 * page is copy on one side and a figure on the other, alternating; a fifth one
 * of those would have made the ladder read as one more feature in a list. It is
 * the thing that makes the mode different from every other retake server, so it
 * gets its own shape: a full-width band, three rungs laid out left to right in
 * the order a team climbs them, and no section number.
 *
 * The bars are the whole explanation. A tier is two quantities — how good the
 * guns are and how much you can throw — and the interesting fact about the mode
 * is that they trade against each other in the middle. Two bars per rung says
 * that in a glance, where a paragraph saying "better weapons, worse utility"
 * needs to be read twice.
 *
 * Mid is drawn as one rung split in two rather than as two rungs, because it IS
 * one rung: a team on Mid has the same number on the ladder either way, and
 * only the direction it arrived from decides which half it plays.
 */

/** How full a bar is, 0 to 4, per rung. */
type Bars = { gun: number; util: number };

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="bt-meter" role="img" aria-label={`${label}: ${value} of 4`}>
      <span className="bt-meter-label">{label}</span>
      <span className="bt-meter-bars" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < value ? "on" : ""} />
        ))}
      </span>
    </div>
  );
}

/** A rung of the ladder, as a stack of blocks with the current one lit. */
function Rungs({ at }: { at: 1 | 2 | 3 }) {
  return (
    <svg className="bt-rungs" viewBox="0 0 22 34" aria-hidden>
      {[3, 2, 1].map((rung, i) => (
        <rect
          key={rung}
          x={0}
          y={i * 12}
          width={22}
          height={8}
          className={rung === at ? "on" : ""}
        />
      ))}
    </svg>
  );
}

/** One chevron per rung moved. Up is a climb, down is a fall. */
function Move({ dir }: { dir: "up" | "down" }) {
  return (
    <svg className={`bt-move ${dir}`} viewBox="0 0 24 24" aria-hidden>
      <path
        d={dir === "up" ? "M12 5 L21 19 L3 19 Z" : "M12 19 L3 5 L21 5 Z"}
        fill="currentColor"
      />
    </svg>
  );
}

export default function BlitzTiers() {
  const { t } = useI18n();

  const tiers: { id: "low" | "mid" | "high"; at: 1 | 2 | 3; bars: Bars }[] = [
    { id: "low", at: 1, bars: { gun: 1, util: 1 } },
    { id: "mid", at: 2, bars: { gun: 3, util: 2 } },
    { id: "high", at: 3, bars: { gun: 4, util: 4 } },
  ];

  return (
    <section className="bt" aria-labelledby="bt-title">
      <header className="bt-head">
        <h2 id="bt-title">{t("home.tiers.title")}</h2>
        <p>{t("home.tiers.lede")}</p>
      </header>

      <ol className="bt-ladder">
        {tiers.map((tier) => (
          <li key={tier.id} className={`bt-tier bt-${tier.id}`}>
            <div className="bt-tier-head">
              <Rungs at={tier.at} />
              <div>
                <span className="bt-tier-n">{t("home.tiers.rung", { n: String(tier.at) })}</span>
                <h3>{t(`home.tiers.${tier.id}.name`)}</h3>
              </div>
            </div>

            <div className="bt-meters">
              <Meter value={tier.bars.gun} label={t("home.tiers.gun")} />
              <Meter value={tier.bars.util} label={t("home.tiers.util")} />
            </div>

            <p className="bt-tier-body">{t(`home.tiers.${tier.id}.body`)}</p>

            {/* Mid is the only rung with two characters, so it is the only one
                that says so. Spelling it out on all three for symmetry would
                imply the other two have a hidden variant as well. */}
            {tier.id === "mid" && (
              <ul className="bt-split">
                <li>
                  <Move dir="up" />
                  <span>{t("home.tiers.mid.power")}</span>
                </li>
                <li>
                  <Move dir="down" />
                  <span>{t("home.tiers.mid.utility")}</span>
                </li>
              </ul>
            )}
          </li>
        ))}
      </ol>

      <ul className="bt-rules">
        <li>
          <Move dir="up" />
          {t("home.tiers.rule.win")}
        </li>
        <li>
          <Move dir="down" />
          {t("home.tiers.rule.loss")}
        </li>
        <li>{t("home.tiers.rule.pistol")}</li>
        <li>{t("home.tiers.rule.ot")}</li>
      </ul>
    </section>
  );
}
