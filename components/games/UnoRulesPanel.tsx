"use client";

// Host-facing OUNO setup, shown in the lobby's setup modal. Everything here is
// pushed to the server so the whole table sees the ruleset it's readying up for.

import React from "react";
import { translator, OUNO, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, Stepper, ToggleCard, PresetRow, type Chip } from "@/components/games/setup/SetupUI";

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

/** Chips for the lobby strip: the hand size, the call window and what's on. */
export function summarizeUno(rules: UnoRules = {}, extras: UnoExtras = {}, lang: Lang): Chip[] {
  const t = translator(OUNO, lang);
  const chips: Chip[] = [
    { label: `🃏 ${t("ruleCardsUnit", { n: rules.startingCards ?? 7 })}`, tone: "info" },
    { label: `⏱ ${t("ruleSeconds", { n: (rules.callWindowMs ?? 5000) / 1000 })}`, tone: "info" },
  ];
  for (const r of RULE_TOGGLES) if (rules[r.key]) chips.push({ label: t(r.name as any), tone: "on" });
  const extraCount = EXTRA_CARDS.filter((c) => extras[c.key]).length;
  if (extraCount) chips.push({ label: `✨ ${t("optionalCards")} ×${extraCount}`, tone: "on" });
  return chips;
}

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

  return (
    <SetupTabs
      tabs={[
        {
          id: "rules",
          label: t("houseRules"),
          icon: "📜",
          badge: String(RULE_TOGGLES.filter((r) => rules[r.key]).length),
          node: (
            <>
              <PresetRow
                label={t("presetsTitle")}
                disabled={!isHost}
                presets={[
                  { id: "classic", label: t("presetClassic") },
                  { id: "chaos", label: t("presetChaos") },
                  { id: "brutal", label: t("presetBrutal") },
                ]}
                onPick={(id) => isHost && onChange(PRESETS[id])}
              />
              <div className="setup-toggles">
                {RULE_TOGGLES.map((r) => (
                  <ToggleCard
                    key={r.key}
                    name={t(r.name as any)}
                    desc={t(r.desc as any)}
                    on={!!rules[r.key]}
                    disabled={!isHost}
                    locked={r.key === "stackAnyDraw" && !rules.stacking}
                    onToggle={() => setRule(r.key, !rules[r.key])}
                  />
                ))}
              </div>
            </>
          ),
        },
        {
          id: "cards",
          label: t("optionalCards"),
          icon: "✨",
          badge: String(EXTRA_CARDS.filter((c) => extras[c.key]).length),
          node: (
            <div className="setup-toggles">
              {EXTRA_CARDS.map((c) => (
                <ToggleCard
                  key={c.key}
                  glyph={c.glyph}
                  name={t(c.name as any)}
                  desc={t(c.desc as any)}
                  on={!!extras[c.key]}
                  disabled={!isHost}
                  onToggle={() => setExtra(c.key, !extras[c.key])}
                />
              ))}
            </div>
          ),
        },
        {
          id: "call",
          label: t("callOuno"),
          icon: "⏱",
          node: (
            <>
              <SetupSection>
                <div className="setup-steppers">
                  <Stepper
                    label={t("ruleStartingCards")}
                    value={rules.startingCards ?? 7}
                    options={[5, 7, 10]}
                    disabled={!isHost}
                    onPick={(n) => setRule("startingCards", n)}
                  />
                  <Stepper
                    label={t("ruleCallWindow")}
                    hint={t("ruleCallWindowD")}
                    value={rules.callWindowMs ?? 5000}
                    options={[3000, 5000, 8000]}
                    unit={(n) => t("ruleSeconds", { n: n / 1000 })}
                    disabled={!isHost}
                    onPick={(n) => setRule("callWindowMs", n)}
                  />
                  <Stepper
                    label={t("ruleForgotPenalty")}
                    value={rules.forgotPenalty ?? 4}
                    options={[2, 4, 6]}
                    unit={(n) => `+${n}`}
                    disabled={!isHost}
                    onPick={(n) => setRule("forgotPenalty", n)}
                  />
                  <Stepper
                    label={t("ruleFalseCall")}
                    value={rules.falseCallPenalty ?? 2}
                    options={[0, 2, 4]}
                    unit={(n) => `+${n}`}
                    disabled={!isHost}
                    onPick={(n) => setRule("falseCallPenalty", n)}
                  />
                  <Stepper
                    label={t("ruleFalseCatch")}
                    value={rules.falseCatchPenalty ?? 2}
                    options={[0, 2, 4]}
                    unit={(n) => `+${n}`}
                    disabled={!isHost}
                    onPick={(n) => setRule("falseCatchPenalty", n)}
                  />
                </div>
              </SetupSection>
              <div className="setup-toggles">
                <ToggleCard
                  wide
                  glyph="⏱"
                  name={t("ruleAutoPenalty")}
                  desc={t("ruleAutoPenaltyD")}
                  on={!!rules.autoPenalty}
                  disabled={!isHost}
                  onToggle={() => setRule("autoPenalty", !rules.autoPenalty)}
                />
              </div>
            </>
          ),
        },
      ]}
    />
  );
}
