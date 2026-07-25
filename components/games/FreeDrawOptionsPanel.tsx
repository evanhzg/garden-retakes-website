"use client";

// Host-facing FREE-DRAW setup — how many times each player takes the pen.

import React from "react";
import { translator, SKRIBBL, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, Stepper, type Chip } from "@/components/games/setup/SetupUI";

export function summarizeFreeDraw(rounds: number, wordLang: Lang, lang: Lang): Chip[] {
  const t = translator(SKRIBBL, lang);
  return [
    { label: `🔁 ${t("roundsUnit", { n: rounds })}`, tone: "info" },
    { label: `🔤 ${t("wordsFrom", { lang: wordLang === "fr" ? t("langFrench") : t("langEnglish") })}`, tone: "info" },
  ];
}

export default function FreeDrawOptionsPanel({ rounds, wordLang, isHost, lang, onChange }: {
  rounds: number;
  wordLang: Lang;
  isHost: boolean;
  lang: Lang;
  onChange: (rounds: number) => void;
}) {
  const t = translator(SKRIBBL, lang);

  return (
    <SetupTabs
      tabs={[
        {
          id: "game",
          label: t("optionsTitle"),
          icon: "✏️",
          node: (
            <SetupSection hint={t("wordsFrom", { lang: wordLang === "fr" ? t("langFrench") : t("langEnglish") })}>
              <div className="setup-steppers">
                <Stepper
                  label={t("rounds")}
                  hint={t("roundsHint")}
                  value={rounds}
                  options={[2, 3, 5, 8]}
                  disabled={!isHost}
                  onPick={(n) => isHost && onChange(n)}
                />
              </div>
            </SetupSection>
          ),
        },
      ]}
    />
  );
}
