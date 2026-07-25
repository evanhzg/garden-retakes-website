"use client";

// Host-facing HEADSHOT setup for the lobby: how long the race is, whether each
// pro is on a clock, and how many misses before the answer is handed over.

import React from "react";
import { translator, HEADSHOT, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, Stepper, type Chip } from "@/components/games/setup/SetupUI";

export type HeadshotOptions = { targetScore: number; roundTimer: number; revealAfter: number };

export function summarizeHeadshot(options: Partial<HeadshotOptions> = {}, lang: Lang): Chip[] {
  const t = translator(HEADSHOT, lang);
  const timer = options.roundTimer ?? 0;
  return [
    { label: `🎯 ${t("correctUnit", { n: options.targetScore ?? 5 })}`, tone: "info" },
    { label: `⏱ ${timer === 0 ? t("noTimer") : t("seconds", { n: timer })}`, tone: timer ? "on" : "info" },
    { label: `❌ ${options.revealAfter ?? 8}`, tone: "info" },
  ];
}

export default function HeadshotOptionsPanel({ options, isHost, lang, onChange }: {
  options: HeadshotOptions;
  isHost: boolean;
  lang: Lang;
  onChange: (payload: { options: Partial<HeadshotOptions> }) => void;
}) {
  const t = translator(HEADSHOT, lang);
  const set = (patch: Partial<HeadshotOptions>) => { if (isHost) onChange({ options: patch }); };

  return (
    <SetupTabs
      tabs={[
        {
          id: "race",
          label: t("optionsTitle"),
          icon: "🎯",
          node: (
            <SetupSection hint={t("modeRaceD", { n: options.targetScore ?? 5 })}>
              <div className="setup-steppers">
                <Stepper
                  label={t("targetScore")}
                  hint={t("targetScoreD")}
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
