"use client";

// Host-facing CODENAMES setup for the lobby: the board, the word packs, the
// clocks and the rule variants. Team seating lives on the roster instead, since
// picking a colour is something every player does for themselves.

import React from "react";
import { translator, CODENAMES, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, Stepper, ToggleCard, ChoiceRow, PackGrid, PresetRow, type Chip } from "@/components/games/setup/SetupUI";

export type CodenamesOptions = {
  boardSize: number;
  packs: Record<string, boolean>;
  assassins: number;
  bonusGuess: boolean;
  unlimitedGuesses: boolean;
  zeroClue: boolean;
  doubleAgent: boolean;
  clueTimer: number;
  turnTimer: number;
  firstTeam: "red" | "blue" | "random";
  revealKey: boolean;
};

const PACKS: { key: string; label: string; glyph: string }[] = [
  { key: "classic", label: "packClassic", glyph: "📖" },
  { key: "cs2", label: "packCs2", glyph: "🔫" },
  { key: "gaming", label: "packGaming", glyph: "🎮" },
  { key: "party", label: "packParty", glyph: "🎉" },
];

const VARIANTS: { key: keyof CodenamesOptions; name: string; desc: string; glyph: string }[] = [
  { key: "bonusGuess", name: "ruleBonus", desc: "ruleBonusD", glyph: "+1" },
  { key: "unlimitedGuesses", name: "ruleUnlimited", desc: "ruleUnlimitedD", glyph: "∞" },
  { key: "zeroClue", name: "ruleZero", desc: "ruleZeroD", glyph: "0" },
  { key: "doubleAgent", name: "ruleDouble", desc: "ruleDoubleD", glyph: "⚑" },
  { key: "revealKey", name: "ruleRevealKey", desc: "ruleRevealKeyD", glyph: "👁" },
];

const PRESETS: Record<string, Partial<CodenamesOptions>> = {
  classic: {
    boardSize: 5, assassins: 1, bonusGuess: true, unlimitedGuesses: false,
    zeroClue: true, doubleAgent: false, clueTimer: 0, turnTimer: 0,
    firstTeam: "random", revealKey: true,
  },
  blitz: {
    boardSize: 5, assassins: 1, bonusGuess: true, unlimitedGuesses: false,
    zeroClue: true, doubleAgent: false, clueTimer: 45, turnTimer: 60,
    firstTeam: "random", revealKey: true,
  },
  deadly: {
    boardSize: 6, assassins: 2, bonusGuess: false, unlimitedGuesses: true,
    zeroClue: true, doubleAgent: true, clueTimer: 45, turnTimer: 60,
    firstTeam: "random", revealKey: true,
  },
};

export function summarizeCodenames(options: Partial<CodenamesOptions> = {}, lang: Lang): Chip[] {
  const t = translator(CODENAMES, lang);
  const size = options.boardSize ?? 5;
  const chips: Chip[] = [
    { label: `▦ ${size}×${size}`, tone: "info" },
    { label: `💀 ×${options.assassins ?? 1}`, tone: (options.assassins ?? 1) > 1 ? "on" : "info" },
  ];
  for (const p of PACKS) if (options.packs?.[p.key]) chips.push({ label: t(p.label as any), tone: "on" });

  const clue = options.clueTimer ?? 0;
  const turn = options.turnTimer ?? 0;
  chips.push({
    label: `⏱ ${clue ? t("seconds", { n: clue }) : t("noTimer")} / ${turn ? t("seconds", { n: turn }) : t("noTimer")}`,
    tone: clue || turn ? "on" : "info",
  });

  for (const v of VARIANTS) {
    if (v.key === "revealKey") continue;              // housekeeping, not a rule anyone plays around
    if (options[v.key]) chips.push({ label: t(v.name as any), tone: "on" });
  }
  return chips;
}

export default function CodenamesOptionsPanel({ options, isHost, lang, onChange }: {
  options: CodenamesOptions;
  isHost: boolean;
  lang: Lang;
  onChange: (payload: { options: Partial<CodenamesOptions> }) => void;
}) {
  const t = translator(CODENAMES, lang);
  const set = (patch: Partial<CodenamesOptions>) => { if (isHost) onChange({ options: patch }); };
  const packs = options.packs || {};
  const packCount = PACKS.filter((p) => packs[p.key]).length;

  return (
    <SetupTabs
      tabs={[
        {
          id: "board",
          label: t("boardSize"),
          icon: "▦",
          node: (
            <>
              <PresetRow
                label={t("presetsTitle")}
                disabled={!isHost}
                presets={[
                  { id: "classic", label: t("presetClassic") },
                  { id: "blitz", label: t("presetBlitz") },
                  { id: "deadly", label: t("presetDeadly") },
                ]}
                onPick={(id) => set(PRESETS[id])}
              />
              <ChoiceRow
                label={t("boardSize")}
                value={options.boardSize ?? 5}
                disabled={!isHost}
                onPick={(n) => set({ boardSize: n })}
                options={[
                  { value: 5, label: "5 × 5", desc: "25", glyph: "▦" },
                  { value: 6, label: "6 × 6", desc: "36", glyph: "▩" },
                ]}
              />
              <ChoiceRow
                label={t("firstTeam")}
                value={options.firstTeam ?? "random"}
                disabled={!isHost}
                onPick={(v) => set({ firstTeam: v })}
                options={[
                  { value: "random", label: t("firstRandom"), glyph: "🎲" },
                  { value: "red", label: t("red"), glyph: "🔴" },
                  { value: "blue", label: t("blue"), glyph: "🔵" },
                ]}
              />
              <SetupSection>
                <div className="setup-steppers">
                  <Stepper
                    label={t("assassins")}
                    hint={t("assassinsD")}
                    value={options.assassins ?? 1}
                    options={[1, 2]}
                    unit={(n) => "💀".repeat(n)}
                    disabled={!isHost}
                    onPick={(n) => set({ assassins: n })}
                  />
                </div>
              </SetupSection>
            </>
          ),
        },
        {
          id: "words",
          label: t("packs"),
          icon: "📖",
          badge: String(packCount),
          node: (
            <PackGrid
              label={t("packs")}
              hint={t("packsHint")}
              packs={PACKS.map((p) => ({ key: p.key, label: t(p.label as any), glyph: p.glyph }))}
              values={packs}
              disabled={!isHost}
              onToggle={(key, on) => {
                // Emptying the board isn't a legal setup — keep the last pack on.
                if (!on && packCount <= 1) return;
                set({ packs: { ...packs, [key]: on } });
              }}
            />
          ),
        },
        {
          id: "rules",
          label: t("optionsTitle"),
          icon: "📜",
          badge: String(VARIANTS.filter((v) => v.key !== "revealKey" && options[v.key]).length),
          node: (
            <div className="setup-toggles">
              {VARIANTS.map((v) => (
                <ToggleCard
                  key={v.key}
                  glyph={v.glyph}
                  name={t(v.name as any)}
                  desc={t(v.desc as any)}
                  on={!!options[v.key]}
                  disabled={!isHost}
                  // With unlimited guesses switched on, the classic +1 is moot.
                  locked={v.key === "bonusGuess" && !!options.unlimitedGuesses}
                  onToggle={() => set({ [v.key]: !options[v.key] } as Partial<CodenamesOptions>)}
                />
              ))}
            </div>
          ),
        },
        {
          id: "clocks",
          label: t("clueTimer"),
          icon: "⏱",
          node: (
            <div className="setup-steppers">
              <Stepper
                label={t("clueTimer")}
                value={options.clueTimer ?? 0}
                options={[0, 45, 60, 90]}
                unit={(n) => (n === 0 ? t("noTimer") : t("seconds", { n }))}
                disabled={!isHost}
                onPick={(n) => set({ clueTimer: n })}
              />
              <Stepper
                label={t("turnTimer")}
                value={options.turnTimer ?? 0}
                options={[0, 60, 90, 120]}
                unit={(n) => (n === 0 ? t("noTimer") : t("seconds", { n }))}
                disabled={!isHost}
                onPick={(n) => set({ turnTimer: n })}
              />
            </div>
          ),
        },
      ]}
    />
  );
}
