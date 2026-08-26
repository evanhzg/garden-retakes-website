"use client";

import ReactMarkdown from "react-markdown";
import { useI18n } from "@/components/I18nProvider";
import type { PoolMap } from "./TournamentView";
import "./rules.css";

// The Rules tab.
//
// Two halves. The organizer writes theirs; the rest is how THIS format works,
// generated from the tournament's own settings rather than written down —
// because a rules page that says BO3 when the tournament is BO1 is worse than
// no rules page, and that is exactly what a hand-written one becomes.

export type RulesFacts = {
  teamSize: number;
  maxTeams: number;
  teamCount: number;
  format: string;
  seeding: string;
  bestOf: number;
  finalBestOf: number | null;
  startsAt: string | null;
  rulesText: string;
  prizeText: string;
  sponsorsText: string;
  pool: PoolMap[];
};

const FORMAT_LABEL: Record<string, string> = {
  single: "Single elimination",
  double: "Double elimination",
  group: "Groups, round robin",
  swiss: "Swiss",
};

const SEEDING_LABEL: Record<string, string> = {
  random: "Random",
  faceit: "FACEIT level, team average",
  manual: "Set by the organizer",
};

export default function Rules({ facts }: { facts: RulesFacts }) {
  const { t } = useI18n();

  return (
    <div className="rl">
      {/* The facts first, as a table, because they are what people came for and
          they are the part that cannot be out of date. */}
      <section className="rl-block">
        <h3>{t("rules.thisTournament")}</h3>

        <dl className="rl-facts">
          <div>
            <dt>{t("rules.format")}</dt>
            <dd>{FORMAT_LABEL[facts.format] ?? facts.format}</dd>
          </div>
          <div>
            <dt>{t("rules.series")}</dt>
            <dd>
              BO{facts.bestOf}
              {facts.finalBestOf && facts.finalBestOf !== facts.bestOf
                ? ` · ${t("rules.final")} BO${facts.finalBestOf}`
                : ""}
            </dd>
          </div>
          <div>
            <dt>{t("rules.seeding")}</dt>
            <dd>{SEEDING_LABEL[facts.seeding] ?? facts.seeding}</dd>
          </div>
          <div>
            <dt>{t("settings.teamSize")}</dt>
            <dd>
              {facts.teamSize}v{facts.teamSize}
            </dd>
          </div>
          <div>
            <dt>{t("tournaments.teams")}</dt>
            <dd>
              {facts.teamCount} / {facts.maxTeams}
            </dd>
          </div>
          {facts.startsAt && (
            <div>
              <dt>{t("settings.startsAt")}</dt>
              <dd>
                {new Date(facts.startsAt).toLocaleString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {facts.pool.length > 0 && (
        <section className="rl-block">
          <h3>{t("tournaments.tabs.pool")}</h3>
          <p className="rl-pool">{facts.pool.map((m) => m.label).join(" · ")}</p>
        </section>
      )}

      {/* How a match actually runs. Written once here rather than repeated in
          every organizer's rules text, because it is the same every time and
          it is the part players get wrong. */}
      <section className="rl-block">
        <h3>{t("rules.howMatches")}</h3>
        <ol className="rl-steps">
          <li>{t("rules.step1")}</li>
          <li>{t("rules.step2")}</li>
          <li>{t("rules.step3")}</li>
          <li>{t("rules.step4")}</li>
          <li>{t("rules.step5")}</li>
        </ol>
      </section>

      <section className="rl-block">
        <h3>{t("rules.inGame")}</h3>
        <ul className="rl-list">
          <li>{t("rules.game1")}</li>
          <li>{t("rules.game2")}</li>
          <li>{t("rules.game3")}</li>
          <li>{t("rules.game4")}</li>
          <li>{t("rules.game5")}</li>
        </ul>
      </section>

      {facts.rulesText.trim() && (
        <section className="rl-block">
          <h3>{t("rules.organizerRules")}</h3>
          <div className="rl-md">
            <ReactMarkdown>{facts.rulesText}</ReactMarkdown>
          </div>
        </section>
      )}

      {facts.prizeText.trim() && (
        <section className="rl-block">
          <h3>{t("settings.prizes")}</h3>
          <div className="rl-md">
            <ReactMarkdown>{facts.prizeText}</ReactMarkdown>
          </div>
        </section>
      )}

      {facts.sponsorsText.trim() && (
        <section className="rl-block">
          <h3>{t("settings.sponsors")}</h3>
          <div className="rl-md">
            <ReactMarkdown>{facts.sponsorsText}</ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
}
