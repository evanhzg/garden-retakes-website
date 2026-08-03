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

const EXPECTED = [
  { term: "Kills", value: "0.65", note: "per round, against five enemies" },
  { term: "Damage", value: "85", note: "per round" },
  { term: "Survival", value: "45%", note: "of rounds" },
  { term: "KAST", value: "70%", note: "of rounds" },
  { term: "Impact", value: "0.35", note: "per round" },
];

const IMPACT = [
  { term: "Opening kill", value: "+0.40" },
  { term: "Opening death", value: "−0.15" },
  { term: "2K / 3K / 4K / ace", value: "+0.10 / +0.35 / +0.70 / +1.20" },
  { term: "Clutch won", value: "+0.30, and +0.15 per extra enemy" },
  { term: "Trade kill", value: "+0.08 each" },
  { term: "Flash assist", value: "+0.07 each" },
  { term: "Utility damage", value: "+0.15 per 100" },
  { term: "Team kill, round live", value: "−0.30" },
  { term: "Team kill, round decided", value: "+0.05" },
  { term: "Bomb plant / defuse", value: "0.00 — see below" },
];

export default function HowRatingWorks() {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel rating-doc">
      <button className="rating-doc-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <strong>How rating and CS Rating are calculated</strong>
          <span className="muted"> — every term, every default</span>
        </span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="rating-doc-body">
          <h3>Rating</h3>
          <p>
            A round is scored against what an average round looks like here. Each of the five parts is
            your value divided by the expected value, so <span className="num">1.00</span> is average
            and <span className="num">2.00</span> is twice it. The parts are then weighted and added:
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
            The weights sum to <span className="num">1.00</span>, which is what keeps an average round
            at <span className="num">1.00</span> rather than some arbitrary number. A season&rsquo;s
            rating is the mean of its rounds, clamped to{" "}
            <span className="num">0.00&ndash;5.00</span>.
          </p>

          <h4>What counts as average</h4>
          <dl className="rating-defs">
            {EXPECTED.map((e) => (
              <div key={e.term}>
                <dt>{e.term}</dt>
                <dd><span className="num">{e.value}</span> <span className="muted">{e.note}</span></dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            Kills and damage expectations scale with how many enemies are actually alive, so a 3v3
            is not judged against 5v5 numbers. Round type shifts them too: pistol rounds expect
            slightly less, full buys slightly more.
          </p>

          <h4>Impact</h4>
          <p>Impact is the part that is not visible in a scoreboard. It is a sum of events:</p>
          <dl className="rating-defs">
            {IMPACT.map((i) => (
              <div key={i.term}>
                <dt>{i.term}</dt>
                <dd className="num">{i.value}</dd>
              </div>
            ))}
          </dl>

          <h4>Why planting and defusing are worth nothing</h4>
          <p>
            This is a retake server. The bomb is <em>already planted</em> when the round starts, and
            the CTs have to defuse it to win — so both were paying you for doing the thing the round
            is about. Everyone who played competently collected them every round, which made them a
            measure of attendance rather than contribution. They are set to zero rather than removed,
            so an older season&rsquo;s numbers still reproduce exactly.
          </p>

          <h4>Why a team kill can be worth a little</h4>
          <p>
            Killing a teammate while the round is live costs your team the round, and is penalised.
            Once every enemy is dead or the bomb is already defused, nothing is at stake — so it is a
            joke rather than a throw. It pays a small amount: enough to be worth something, never
            enough to be worth farming.
          </p>

          <h3>CS Rating</h3>
          <p>
            Elo moves on whether your team won the round, adjusted by how likely that was and by how
            well you personally played. The expectation comes from the two teams&rsquo; average
            ratings:
          </p>
          <pre className="rating-formula num">
{`expected = 1 ÷ (1 + 10^((theirElo − yourElo) ÷ 400))
change   = K × (won − expected) × performanceFactor`}
          </pre>
          <p>
            <span className="num">K</span> sets how fast ratings move; the divisor of{" "}
            <span className="num">400</span> is the standard Elo scale, meaning a 400-point gap makes
            you roughly ten times more likely to win. The performance factor is your round rating, so
            winning while playing badly gains less than winning while carrying, and losing while
            playing well costs less.
          </p>
          <p className="muted">
            Elo is bounded to <span className="num">0&ndash;35,000</span> and starts at{" "}
            <span className="num">5,000</span>. Rounds you were AFK for are excluded entirely.
          </p>

          <h4>Season boundaries</h4>
          <p>
            These values are fixed per season. A change made for a coming season is written against
            that season and does nothing until it starts — so no round is ever re-priced after it was
            played, and the rating you were shown at the time stays the rating you earned.
          </p>
        </div>
      )}
    </section>
  );
}
