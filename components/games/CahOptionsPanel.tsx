"use client";

// Host-facing PILE OF... setup for the lobby: rounds, turn timer, custom cards.

import React from "react";
import { translator, PILEOF, type Lang } from "@/components/games/i18n";
import { SetupTabs, Stepper, ToggleCard, type Chip } from "@/components/games/setup/SetupUI";

export type CahOptions = { rounds: number; timer: number; allowCustom: boolean };

export function summarizeCah(options: Partial<CahOptions> = {}, lang: Lang): Chip[] {
  const t = translator(PILEOF, lang);
  const timer = options.timer ?? 60;
  return [
    { label: `🔁 ${options.rounds ?? 8} ${t("rounds")}`, tone: "info" },
    { label: `⏱ ${timer === 0 ? t("infinite") : t("seconds", { n: timer })}`, tone: "info" },
    { label: `✎ ${t("allowCustom")}`, tone: options.allowCustom ? "on" : "off" },
  ];
}

export default function CahOptionsPanel({ options, isHost, lang, onChange }: {
  options: CahOptions;
  isHost: boolean;
  lang: Lang;
  onChange: (payload: { options: Partial<CahOptions> }) => void;
}) {
  const t = translator(PILEOF, lang);
  const set = (patch: Partial<CahOptions>) => { if (isHost) onChange({ options: patch }); };

  return (
    <SetupTabs
      tabs={[
        {
          id: "game",
          label: t("optionsTitle"),
          icon: "⬛",
          node: (
            <>
              <div className="setup-steppers">
                <Stepper
                  label={t("rounds")}
                  value={options.rounds ?? 8}
                  options={[5, 8, 12]}
                  disabled={!isHost}
                  onPick={(n) => set({ rounds: n })}
                />
                <Stepper
                  label={t("timer")}
                  value={options.timer ?? 60}
                  options={[0, 30, 60, 90]}
                  unit={(n) => (n === 0 ? t("infinite") : t("seconds", { n }))}
                  disabled={!isHost}
                  onPick={(n) => set({ timer: n })}
                />
              </div>
              <div className="setup-toggles">
                <ToggleCard
                  wide
                  glyph="✎"
                  name={t("allowCustom")}
                  desc={t("allowCustomD")}
                  on={!!options.allowCustom}
                  disabled={!isHost}
                  onToggle={() => set({ allowCustom: !options.allowCustom })}
                />
              </div>
            </>
          ),
        },
      ]}
    />
  );
}
