"use client";

// Host-facing OUNO setup, shown in the universal lobby. Everything here is
// pushed to the server so the whole table sees the ruleset it's readying up for.

import React from "react";
import { translator, OUNO, type Lang } from "@/components/games/i18n";

export type UnoRules = Record<string, any>;
export type UnoExtras = Record<string, boolean>;

const RULE_TOGGLES: { key: string; name: string; desc: string }[] = [
  { key: "stacking", name: "ruleStacking", desc: "ruleStackingD" },
  { key: "stackAnyDraw", name: "ruleStackAny", desc: "ruleStackAnyD" },
  { key: "jumpIn", name: "ruleJumpIn", desc: "ruleJumpInD" },
  { key: "sevenZero", name: "ruleSevenZero", desc: "ruleSevenZeroD" },
  { key: "playOnDraw", name: "rulePlayOnDraw", desc: "rulePlayOnDrawD" },
  { key: "drawToMatch", name: "ruleDrawToMatch", desc: "ruleDrawToMatchD" },
  { key: "forcePlay", name: "ruleForcePlay", desc: "ruleForcePlayD" },
  { key: "challengeDrawFour", name: "ruleChallenge", desc: "ruleChallengeD" },
];

const EXTRA_CARDS: { key: string; name: string; desc: string; glyph: string }[] = [
  { key: "swapHands", name: "extraSwap", desc: "extraSwapD", glyph: "⇆" },
  { key: "shuffleHands", name: "extraShuffle", desc: "extraShuffleD", glyph: "⤨" },
  { key: "skipAll", name: "extraSkipAll", desc: "extraSkipAllD", glyph: "⊘" },
  { key: "discardAll", name: "extraDiscardAll", desc: "extraDiscardAllD", glyph: "⇩" },
  { key: "drawSix", name: "extraDrawSix", desc: "extraDrawSixD", glyph: "+6" },
];

const PRESETS: Record<string, { rules: UnoRules; extras: UnoExtras }> = {
  classic: {
    rules: {
      stacking: false, stackAnyDraw: false, sevenZero: false, jumpIn: false,
      playOnDraw: true, drawToMatch: false, forcePlay: false, challengeDrawFour: true,
      startingCards: 7, callWindowMs: 8000, autoPenalty: true, forgotPenalty: 2,
      falseCallPenalty: 2, falseCatchPenalty: 2,
    },
    extras: { swapHands: false, shuffleHands: false, skipAll: false, discardAll: false, drawSix: false },
  },
  chaos: {
    rules: {
      stacking: true, stackAnyDraw: true, sevenZero: true, jumpIn: true,
      playOnDraw: true, drawToMatch: false, forcePlay: false, challengeDrawFour: true,
      startingCards: 7, callWindowMs: 5000, autoPenalty: true, forgotPenalty: 4,
      falseCallPenalty: 2, falseCatchPenalty: 2,
    },
    extras: { swapHands: true, shuffleHands: true, skipAll: true, discardAll: false, drawSix: false },
  },
  brutal: {
    rules: {
      stacking: true, stackAnyDraw: true, sevenZero: true, jumpIn: true,
      playOnDraw: false, drawToMatch: true, forcePlay: true, challengeDrawFour: true,
      startingCards: 10, callWindowMs: 3000, autoPenalty: true, forgotPenalty: 6,
      falseCallPenalty: 3, falseCatchPenalty: 3,
    },
    extras: { swapHands: true, shuffleHands: true, skipAll: true, discardAll: true, drawSix: true },
  },
};

export default function UnoRulesPanel({ rules, extras, isHost, lang, onChange }: {
  rules: UnoRules;
  extras: UnoExtras;
  isHost: boolean;
  lang: Lang;
  onChange: (payload: { rules?: UnoRules; extras?: UnoExtras }) => void;
}) {
  const t = translator(OUNO, lang);
  const setRule = (key: string, value: any) => { if (isHost) onChange({ rules: { [key]: value } }); };
  const setExtra = (key: string, value: boolean) => { if (isHost) onChange({ extras: { [key]: value } }); };

  const Stepper = ({ label, value, options, unit, onPick }: {
    label: string; value: number; options: number[]; unit?: (n: number) => string; onPick: (n: number) => void;
  }) => (
    <div className="uno-stepper">
      <span className="uno-stepper-label">{label}</span>
      <div className="uno-stepper-opts">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={value === o ? "on" : ""}
            disabled={!isHost}
            onClick={() => onPick(o)}
          >
            {unit ? unit(o) : o}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="uno-rules-panel">
      <div className="picker-header">
        <h3>{t("houseRules")}</h3>
        {!isHost && <span className="picker-hint">{t("hostOnly")}</span>}
      </div>

      <div className="uno-presets">
        <span className="uno-presets-label">{t("presetsTitle")}</span>
        {(["classic", "chaos", "brutal"] as const).map((p) => (
          <button
            key={p}
            type="button"
            className="uno-preset-btn"
            disabled={!isHost}
            onClick={() => onChange(PRESETS[p])}
          >
            {t(p === "classic" ? "presetClassic" : p === "chaos" ? "presetChaos" : "presetBrutal")}
          </button>
        ))}
      </div>

      <div className="uno-rules-grid">
        {RULE_TOGGLES.map((r) => {
          const on = !!rules[r.key];
          const locked = r.key === "stackAnyDraw" && !rules.stacking;
          return (
            <button
              key={r.key}
              type="button"
              className={`uno-rule-card ${on ? "on" : ""} ${locked ? "locked" : ""}`}
              disabled={!isHost || locked}
              onClick={() => setRule(r.key, !on)}
              title={t(r.desc as any)}
            >
              <span className="uno-rule-top">
                <span className="uno-rule-name">{t(r.name as any)}</span>
                <span className={`uno-switch ${on ? "on" : ""}`} aria-hidden />
              </span>
              <span className="uno-rule-desc">{t(r.desc as any)}</span>
            </button>
          );
        })}
      </div>

      <div className="uno-steppers">
        <Stepper
          label={t("ruleStartingCards")}
          value={rules.startingCards ?? 7}
          options={[5, 7, 10]}
          onPick={(n) => setRule("startingCards", n)}
        />
        <Stepper
          label={t("ruleCallWindow")}
          value={rules.callWindowMs ?? 5000}
          options={[3000, 5000, 8000]}
          unit={(n) => t("ruleSeconds", { n: n / 1000 })}
          onPick={(n) => setRule("callWindowMs", n)}
        />
        <Stepper
          label={t("ruleForgotPenalty")}
          value={rules.forgotPenalty ?? 4}
          options={[2, 4, 6]}
          unit={(n) => `+${n}`}
          onPick={(n) => setRule("forgotPenalty", n)}
        />
        <Stepper
          label={t("ruleFalseCall")}
          value={rules.falseCallPenalty ?? 2}
          options={[0, 2, 4]}
          unit={(n) => `+${n}`}
          onPick={(n) => setRule("falseCallPenalty", n)}
        />
        <Stepper
          label={t("ruleFalseCatch")}
          value={rules.falseCatchPenalty ?? 2}
          options={[0, 2, 4]}
          unit={(n) => `+${n}`}
          onPick={(n) => setRule("falseCatchPenalty", n)}
        />
      </div>

      <button
        type="button"
        className={`uno-rule-card wide ${rules.autoPenalty ? "on" : ""}`}
        disabled={!isHost}
        onClick={() => setRule("autoPenalty", !rules.autoPenalty)}
      >
        <span className="uno-rule-top">
          <span className="uno-rule-name">⏱ {t("ruleAutoPenalty")}</span>
          <span className={`uno-switch ${rules.autoPenalty ? "on" : ""}`} aria-hidden />
        </span>
        <span className="uno-rule-desc">{t("ruleAutoPenaltyD")}</span>
      </button>

      <div className="picker-header sub">
        <h3>{t("optionalCards")}</h3>
      </div>
      <div className="uno-extras-grid">
        {EXTRA_CARDS.map((c) => {
          const on = !!extras[c.key];
          return (
            <button
              key={c.key}
              type="button"
              className={`uno-extra-card ${on ? "on" : ""}`}
              disabled={!isHost}
              onClick={() => setExtra(c.key, !on)}
              title={t(c.desc as any)}
            >
              <span className="uno-extra-glyph">{c.glyph}</span>
              <span className="uno-extra-name">{t(c.name as any)}</span>
              <span className="uno-extra-desc">{t(c.desc as any)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
