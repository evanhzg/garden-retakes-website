"use client";

// Host-facing PILE OF... setup for the lobby: rounds, turn timer, custom cards.

import React from "react";
import { translator, PILEOF, type Lang } from "@/components/games/i18n";

export type CahOptions = { rounds: number; timer: number; allowCustom: boolean };

export default function CahOptionsPanel({ options, isHost, lang, onChange }: {
  options: CahOptions;
  isHost: boolean;
  lang: Lang;
  onChange: (payload: { options: Partial<CahOptions> }) => void;
}) {
  const t = translator(PILEOF, lang);
  const set = (patch: Partial<CahOptions>) => { if (isHost) onChange({ options: patch }); };

  const Stepper = ({ label, value, opts, unit, onPick }: {
    label: string; value: number; opts: number[]; unit?: (n: number) => string; onPick: (n: number) => void;
  }) => (
    <div className="uno-stepper">
      <span className="uno-stepper-label">{label}</span>
      <div className="uno-stepper-opts">
        {opts.map((o) => (
          <button key={o} type="button" className={value === o ? "on" : ""} disabled={!isHost} onClick={() => onPick(o)}>
            {unit ? unit(o) : o}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="uno-rules-panel">
      <div className="picker-header">
        <h3>{t("optionsTitle")}</h3>
        {!isHost && <span className="picker-hint">{t("hostOnly")}</span>}
      </div>

      <div className="uno-steppers">
        <Stepper label={t("rounds")} value={options.rounds ?? 8} opts={[5, 8, 12]} onPick={(n) => set({ rounds: n })} />
        <Stepper
          label={t("timer")}
          value={options.timer ?? 60}
          opts={[0, 30, 60, 90]}
          unit={(n) => (n === 0 ? t("infinite") : t("seconds", { n }))}
          onPick={(n) => set({ timer: n })}
        />
      </div>

      <button
        type="button"
        className={`uno-rule-card wide ${options.allowCustom ? "on" : ""}`}
        disabled={!isHost}
        onClick={() => set({ allowCustom: !options.allowCustom })}
      >
        <span className="uno-rule-top">
          <span className="uno-rule-name">✎ {t("allowCustom")}</span>
          <span className={`uno-switch ${options.allowCustom ? "on" : ""}`} aria-hidden />
        </span>
        <span className="uno-rule-desc">{t("allowCustomD")}</span>
      </button>
    </div>
  );
}
