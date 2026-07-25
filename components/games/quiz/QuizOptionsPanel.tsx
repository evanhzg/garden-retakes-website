"use client";

// Host-facing setup for a quiz race: difficulty, how many correct answers wins,
// and an optional per-question clock. BUILD PATH and BUY MENU share it — only
// the dictionary (and therefore the tier names) differs.

import React from "react";
import { translator, QUIZ, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, Stepper, type Chip } from "@/components/games/setup/SetupUI";

export type QuizOptions = { targetScore: number; tier: number; questionTimer: number };

export function summarizeQuiz(options: Partial<QuizOptions> = {}, lang: Lang, dict: any): Chip[] {
  const t = translator(QUIZ, lang);
  const g = translator(dict, lang);
  const timer = options.questionTimer ?? 0;
  return [
    { label: `🏅 ${g(`tier${options.tier ?? 2}` as any)}`, tone: "on" },
    { label: `🎯 ${options.targetScore ?? 7}`, tone: "info" },
    { label: `⏱ ${timer === 0 ? "—" : t("question", { n: timer, m: "" }).trim() || `${timer}s`}`, tone: timer ? "on" : "info" },
  ];
}

export default function QuizOptionsPanel({ options, isHost, lang, dict, onChange }: {
  options: QuizOptions;
  isHost: boolean;
  lang: Lang;
  dict: any;
  onChange: (payload: { options: Partial<QuizOptions> }) => void;
}) {
  const t = translator(QUIZ, lang);
  const g = translator(dict, lang);
  const set = (patch: Partial<QuizOptions>) => { if (isHost) onChange({ options: patch }); };

  return (
    <SetupTabs
      tabs={[
        {
          id: "quiz",
          label: g("optionsTitle"),
          icon: "🧠",
          node: (
            <SetupSection hint={g(`tier${options.tier ?? 2}D` as any)}>
              <div className="setup-steppers">
                <Stepper
                  label={t("difficulty")}
                  value={options.tier ?? 2}
                  options={[1, 2, 3, 4]}
                  unit={(n) => g(`tier${n}` as any)}
                  disabled={!isHost}
                  onPick={(n) => set({ tier: n })}
                />
                <Stepper
                  label={t("raceTitle", { n: "" }).trim()}
                  value={options.targetScore ?? 7}
                  options={[5, 7, 10]}
                  disabled={!isHost}
                  onPick={(n) => set({ targetScore: n })}
                />
                <Stepper
                  label={t("question", { n: "?", m: "?" })}
                  value={options.questionTimer ?? 0}
                  options={[0, 15, 30, 45]}
                  unit={(n) => (n === 0 ? "—" : `${n}s`)}
                  disabled={!isHost}
                  onPick={(n) => set({ questionTimer: n })}
                />
              </div>
            </SetupSection>
          ),
        },
      ]}
    />
  );
}
