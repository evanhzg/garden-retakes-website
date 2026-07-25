"use client";

// Host-facing setup for the daily guessers' race mode: how long the race is,
// whether each answer is on a clock, and how many misses before the answer is
// handed over. HEADSHOT and PENTAKILL share it — only the dictionary differs.

import React from "react";
import { translator, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, Stepper, type Chip } from "@/components/games/setup/SetupUI";

export type RaceOptions = { targetScore: number; roundTimer: number; revealAfter: number };

export function summarizeRace(options: Partial<RaceOptions> = {}, lang: Lang, dict: any): Chip[] {
  const t = translator(dict, lang);
  const timer = options.roundTimer ?? 0;
  return [
    { label: `🎯 ${t("correctUnit", { n: options.targetScore ?? 5 })}`, tone: "info" },
    { label: `⏱ ${timer === 0 ? t("noTimer") : t("seconds", { n: timer })}`, tone: timer ? "on" : "info" },
    { label: `❌ ${options.revealAfter ?? 8}`, tone: "info" },
  ];
}

export default function RaceOptionsPanel({ options, isHost, lang, dict, icon, onChange }: {
  options: RaceOptions;
  isHost: boolean;
  lang: Lang;
  dict: any;
  icon?: string;
  onChange: (payload: { options: Partial<RaceOptions> }) => void;
}) {
  const t = translator(dict, lang);
  const set = (patch: Partial<RaceOptions>) => { if (isHost) onChange({ options: patch }); };

  return (
    <SetupTabs
      tabs={[
        {
          id: "race",
          label: t("optionsTitle"),
          icon: icon ?? "🎯",
          node: (
            <SetupSection hint={t("targetScoreD")}>
              <div className="setup-steppers">
                <Stepper
                  label={t("targetScore")}
                  value={options.targetScore ?? 5}
                  options={[3, 5, 10]}
                  disabled={!isHost}
                  onPick={(n) => set({ targetScore: n })}
                />
                <Stepper
                  label={t("roundTimer")}
                  value={options.roundTimer ?? 0}
                  options={[0, 60, 90, 120]}
                  unit={(n) => (n === 0 ? t("noTimer") : t("seconds", { n }))}
                  disabled={!isHost}
                  onPick={(n) => set({ roundTimer: n })}
                />
                <Stepper
                  label={t("revealAfter")}
                  hint={t("revealAfterD")}
                  value={options.revealAfter ?? 8}
                  options={[5, 8, 12]}
                  disabled={!isHost}
                  onPick={(n) => set({ revealAfter: n })}
                />
              </div>
            </SetupSection>
          ),
        },
      ]}
    />
  );
}
