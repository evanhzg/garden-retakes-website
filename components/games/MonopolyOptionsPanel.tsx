"use client";

// Host-facing MONOPO7Y setup — which board the table plays on, and whether it's
// a free-for-all or a 2v2 with allies.

import React from "react";
import { translator, MONOPOLY, type Lang } from "@/components/games/i18n";
import { SetupTabs, SetupSection, ChoiceRow, type Chip } from "@/components/games/setup/SetupUI";

type Board = { id: string; name: string; tileCount?: number; accent?: string; groupColors?: Record<string, string> };
type SavedBoard = { id: string; name: string; tiles?: any[]; theme?: { accent?: string; groupColors?: Record<string, string> } };

export function summarizeMonopoly(
  boards: Board[],
  savedBoards: SavedBoard[],
  selectedBoardId: string | undefined,
  teamMode: string | undefined,
  lang: Lang
): Chip[] {
  const t = translator(MONOPOLY, lang);
  const id = selectedBoardId || "classic";
  const board = boards.find((b) => b.id === id) || savedBoards.find((b) => b.id === id);
  return [
    { label: `▦ ${board?.name ?? id}`, tone: "info" },
    { label: teamMode === "2v2" ? `🤝 ${t("mode2v2")}` : `⚔ ${t("modeFfa")}`, tone: teamMode === "2v2" ? "on" : "info" },
  ];
}

export default function MonopolyOptionsPanel({
  boards, savedBoards, selectedBoardId, teamMode, isHost, lang,
  onSelectBoard, onSelectCustomBoard, onSetTeamMode,
}: {
  boards: Board[];
  savedBoards: SavedBoard[];
  selectedBoardId?: string;
  teamMode?: string;
  isHost: boolean;
  lang: Lang;
  onSelectBoard: (id: string) => void;
  onSelectCustomBoard: (def: SavedBoard) => void;
  onSetTeamMode: (mode: string) => void;
}) {
  const t = translator(MONOPOLY, lang);
  const selected = selectedBoardId || "classic";

  return (
    <SetupTabs
      tabs={[
        {
          id: "board",
          label: t("board"),
          icon: "▦",
          node: (
            <SetupSection hint={t("boardHint")}>
              <div className="board-picker-grid">
                {boards.map((b) => {
                  const swatches = Object.values(b.groupColors || {}).slice(0, 8) as string[];
                  return (
                    <button
                      key={b.id}
                      className={`board-pick-card ${selected === b.id ? "selected" : ""}`}
                      onClick={() => isHost && onSelectBoard(b.id)}
                      disabled={!isHost}
                      style={{ ["--accent" as any]: b.accent }}
                      title={b.name}
                    >
                      <span className="board-pick-swatches">{swatches.map((c, i) => <span key={i} style={{ background: c }} />)}</span>
                      <span className="board-pick-name">{b.name}</span>
                      <span className="board-pick-meta">{t("tiles", { n: b.tileCount ?? 0 })}</span>
                    </button>
                  );
                })}
                {savedBoards.map((b) => {
                  const swatches = Object.values(b.theme?.groupColors || {}).slice(0, 8) as string[];
                  return (
                    <button
                      key={b.id}
                      className={`board-pick-card ${selected === b.id ? "selected" : ""}`}
                      onClick={() => isHost && onSelectCustomBoard(b)}
                      disabled={!isHost}
                      style={{ ["--accent" as any]: b.theme?.accent || "#38bdf8" }}
                      title={b.name}
                    >
                      <span className="board-pick-swatches">{swatches.map((c, i) => <span key={i} style={{ background: c }} />)}</span>
                      <span className="board-pick-name">{b.name} <span className="board-pick-custom">{t("custom")}</span></span>
                      <span className="board-pick-meta">{t("tiles", { n: b.tiles?.length ?? 0 })}</span>
                    </button>
                  );
                })}
              </div>
              <div className="setup-presets">
                <a className="setup-preset" href="/board-editor">✎ {t("editBoards")}</a>
                <a className="setup-preset" href="/sandbox">🧪 {t("testBuildings")}</a>
              </div>
            </SetupSection>
          ),
        },
        {
          id: "mode",
          label: t("mode"),
          icon: "⚔",
          node: (
            <ChoiceRow
              label={t("mode")}
              value={teamMode === "2v2" ? "2v2" : "ffa"}
              disabled={!isHost}
              onPick={(m) => onSetTeamMode(m)}
              options={[
                { value: "ffa", label: t("modeFfa"), desc: t("modeFfaD"), glyph: "⚔" },
                { value: "2v2", label: t("mode2v2"), desc: t("mode2v2D"), glyph: "🤝" },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
