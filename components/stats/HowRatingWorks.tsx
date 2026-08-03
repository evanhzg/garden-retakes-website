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
//
// Season 2 adds four things to the bottom half of this document — map points,
// a daily consistency pass, a season-long consistency figure and a harsher Elo
// — and they are appended as their own section rather than woven into the
// Season 1 prose above. Two reasons. A player who already read this page should
// be able to find what is new without re-reading what is not, and when Season 2
// stops being news the section comes out in one piece instead of being unpicked
// from five paragraphs.
//
// Where a Season 2 coefficient is written as a name rather than a number it is
// because the server has not fixed that number yet. The whole point of this
// page is that you can check the arithmetic, and a made-up constant printed in
// the same typeface as a real one would quietly destroy that — so the shape is
// published now and the constants follow when the season opens.

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
    <section className="panel rating-doc" id="how">
      <button className="rating-doc-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {/* The badge rides in the header because the panel is shut on arrival:
            a section nobody opens cannot announce that the rules changed, and
            the closed toggle is the only surface this document ever gets. */}
        <span className="rating-doc-title">
          <strong>{t("stats.howRatingWorks.title")}</strong>
          <span className="rating-s2-badge">{t("stats.howRatingWorks.s2Badge")}</span>
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
            {/* Written out rather than pulled from the dictionary: the entry
                for this range holds a literal "&ndash;", which React escapes,
                so the page was printing the entity instead of a dash. A number
                range is not translatable copy anyway. */}
            <span className="num">0.00–5.00</span>{t("stats.howRatingWorks.ratingSum4")}
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
            <span className="num">0–35,000</span> {t("stats.howRatingWorks.eloBounds2")}
            <span className="num">5,000</span>{t("stats.howRatingWorks.eloBounds3")}
          </p>

          <h4>{t("stats.howRatingWorks.seasonHeading")}</h4>
          <p>
            {t("stats.howRatingWorks.seasonDesc")}
          </p>

          {/* ---------- Season 2 ---------- */}

          <h3>{t("stats.howRatingWorks.s2Heading")}</h3>
          <p>{t("stats.howRatingWorks.s2Desc")}</p>
          <p className="rating-note">{t("stats.howRatingWorks.s2Note")}</p>

          <h4>{t("stats.howRatingWorks.swingHeading")}</h4>
          <p>{t("stats.howRatingWorks.swingDesc1")}</p>
          <pre className="rating-formula num">
{`change = K × (won − expected)
           × performanceFactor
           × consistencyMultiplier

K      = kUp    on a gain
         kDown  on a loss,  kDown > kUp`}
          </pre>
          <p>{t("stats.howRatingWorks.swingDesc2")}</p>

          <h4>{t("stats.howRatingWorks.mapHeading")}</h4>
          <p>{t("stats.howRatingWorks.mapDesc1")}</p>
          <pre className="rating-formula num">
{`vsSelf   = rating here ÷ rating everywhere
vsServer = rating here ÷ server avg here

mapPoints = wSelf   × (vsSelf   − 1)
          + wServer × (vsServer − 1)`}
          </pre>
          <p>{t("stats.howRatingWorks.mapDesc2")}</p>
          <p>{t("stats.howRatingWorks.mapWhy")}</p>

          <h4>{t("stats.howRatingWorks.dailyHeading")}</h4>
          <p>
            {t("stats.howRatingWorks.dailyDesc1")}{" "}
            <span className="num">01:00</span>{" "}
            {t("stats.howRatingWorks.dailyDesc1b")}
          </p>
          <pre className="rating-formula num">
{`spread      = std dev of yesterday's ratings
consistency = 1 − (spread ÷ your mean)

multiplier  = 1 + kSteady × consistency`}
          </pre>
          <p>{t("stats.howRatingWorks.dailyDesc2")}</p>
          <p>{t("stats.howRatingWorks.dailyDesc3")}</p>
          <p>{t("stats.howRatingWorks.dailyMultiplier")}</p>

          <h4>{t("stats.howRatingWorks.globalHeading")}</h4>
          <p>{t("stats.howRatingWorks.globalDesc")}</p>

          <h4>{t("stats.howRatingWorks.freezeHeading")}</h4>
          <p>
            {t("stats.howRatingWorks.freezeDesc1")}{" "}
            <span className="num">72</span>{" "}
            {t("stats.howRatingWorks.freezeDesc1b")}
          </p>
          <p>{t("stats.howRatingWorks.freezeDesc2")}</p>

          <h4>{t("stats.howRatingWorks.calibrationHeading")}</h4>
          <p>{t("stats.howRatingWorks.calibrationDesc")}</p>
        </div>
      )}
    </section>
  );
}
