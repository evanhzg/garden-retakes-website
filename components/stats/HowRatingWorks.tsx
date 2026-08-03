"use client";

import { useState } from "react";

// How rating and CS Rating are actually computed.
//
// This exists because "1.14" and "5240" are numbers people are judged by, and
// a number you cannot check is a number you have to take on faith. Everything
// here is the real formula with the real defaults, not a simplification.
//
// Collapsed by default: most visits to the stats page are not asking this
// question, and a page of algebra above the tables would bury them.

const W = { kill: 0.3, damage: 0.2, survival: 0.15, kast: 0.15, impact: 0.2 };



import { useI18n } from "@/components/I18nProvider";

export default function HowRatingWorks() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const EXPECTED = [
    { term: t("stats.howRatingWorks.expected.kills"), value: "0.65", note: t("stats.howRatingWorks.expected.killsNote") },
    { term: t("stats.howRatingWorks.expected.damage"), value: "85", note: t("stats.howRatingWorks.expected.damageNote") },
    { term: t("stats.howRatingWorks.expected.survival"), value: "45%", note: t("stats.howRatingWorks.expected.survivalNote") },
    { term: t("stats.howRatingWorks.expected.kast"), value: "70%", note: t("stats.howRatingWorks.expected.kastNote") },
    { term: t("stats.howRatingWorks.expected.impact"), value: "0.35", note: t("stats.howRatingWorks.expected.impactNote") },
  ];

  const IMPACT = [
    { term: t("stats.howRatingWorks.impact.openingKill"), value: "+0.40" },
    { term: t("stats.howRatingWorks.impact.openingDeath"), value: "−0.15" },
    { term: t("stats.howRatingWorks.impact.multikill"), value: "+0.10 / +0.35 / +0.70 / +1.20" },
    { term: t("stats.howRatingWorks.impact.clutchWon"), value: t("stats.howRatingWorks.impact.clutchWonValue") },
    { term: t("stats.howRatingWorks.impact.tradeKill"), value: t("stats.howRatingWorks.impact.tradeKillValue") },
    { term: t("stats.howRatingWorks.impact.flashAssist"), value: t("stats.howRatingWorks.impact.flashAssistValue") },
    { term: t("stats.howRatingWorks.impact.utilityDamage"), value: t("stats.howRatingWorks.impact.utilityDamageValue") },
    { term: t("stats.howRatingWorks.impact.teamKillLive"), value: "−0.30" },
    { term: t("stats.howRatingWorks.impact.teamKillDecided"), value: "+0.05" },
    { term: t("stats.howRatingWorks.impact.bombPlantDefuse"), value: t("stats.howRatingWorks.impact.bombPlantDefuseValue") },
  ];

  return (
    <section className="panel rating-doc">
      <button className="rating-doc-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <strong>{t("stats.howRatingWorks.title")}</strong>
          <span className="muted"> {t("stats.howRatingWorks.subtitle")}</span>
        </span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="rating-doc-body">
          <h3>{t("stats.howRatingWorks.ratingHeading")}</h3>
          <p>
            {t("stats.howRatingWorks.ratingDesc1")}
            <span className="num">1.00</span> {t("stats.howRatingWorks.ratingDesc2")}
            <span className="num">2.00</span> {t("stats.howRatingWorks.ratingDesc3")}
          </p>

          <pre className="rating-formula num">
{`rating = ( ${W.kill} × kills/expected
         + ${W.damage} × damage/expected
         + ${W.survival} × survived/expected
         + ${W.kast} × kast/expected
         + ${W.impact} × impact/expected ) ÷ 1.00
         × roundTypeScale`}
          </pre>

          <p>
            {t("stats.howRatingWorks.ratingSum1")}
            <span className="num">1.00</span>{t("stats.howRatingWorks.ratingSum2")}
            <span className="num">1.00</span> {t("stats.howRatingWorks.ratingSum3")}
            <span className="num">{t("auto.howratingworks.0_00_ndash_5_00")}</span>{t("stats.howRatingWorks.ratingSum4")}
          </p>

          <h4>{t("stats.howRatingWorks.averageHeading")}</h4>
          <dl className="rating-defs">
            {EXPECTED.map((e) => (
              <div key={e.term}>
                <dt>{e.term}</dt>
                <dd><span className="num">{e.value}</span> <span className="muted">{e.note}</span></dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            {t("stats.howRatingWorks.averageDesc")}
          </p>

          <h4>{t("stats.howRatingWorks.impactHeading")}</h4>
          <p>{t("stats.howRatingWorks.impactDesc")}</p>
          <dl className="rating-defs">
            {IMPACT.map((i) => (
              <div key={i.term}>
                <dt>{i.term}</dt>
                <dd className="num">{i.value}</dd>
              </div>
            ))}
          </dl>

          <h4>{t("stats.howRatingWorks.plantingHeading")}</h4>
          <p>
            {t("stats.howRatingWorks.plantingDesc1")}
            <em>{t("stats.howRatingWorks.alreadyPlanted")}</em>
            {t("stats.howRatingWorks.plantingDesc2")}
          </p>

          <h4>{t("stats.howRatingWorks.tkHeading")}</h4>
          <p>
            {t("stats.howRatingWorks.tkDesc")}
          </p>

          <h3>{t("stats.howRatingWorks.csRatingHeading")}</h3>
          <p>
            {t("stats.howRatingWorks.csRatingDesc")}
          </p>
          <pre className="rating-formula num">
{`expected = 1 ÷ (1 + 10^((theirElo − yourElo) ÷ 400))
change   = K × (won − expected) × performanceFactor`}
          </pre>
          <p>
            <span className="num">K</span> {t("stats.howRatingWorks.eloDesc1")}
            <span className="num">400</span> {t("stats.howRatingWorks.eloDesc2")}
          </p>
          <p className="muted">
            {t("stats.howRatingWorks.eloBounds1")}
            <span className="num">{t("auto.howratingworks.0_ndash_35_000")}</span> {t("stats.howRatingWorks.eloBounds2")}
            <span className="num">5,000</span>{t("stats.howRatingWorks.eloBounds3")}
          </p>

          <h4>{t("stats.howRatingWorks.seasonHeading")}</h4>
          <p>
            {t("stats.howRatingWorks.seasonDesc")}
          </p>
        </div>
      )}
    </section>
  );
}
