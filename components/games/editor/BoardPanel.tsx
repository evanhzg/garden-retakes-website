"use client";

import React from "react";
import { type BoardDef, GROUP_KEYS } from "@/components/games/monopoly3d/boardSchema";

type Props = {
  def: BoardDef;
  onResize: (perSide: number) => void;
  onBoard: (patch: Partial<BoardDef>) => void;
  onGroupColor: (key: string, value: string) => void;
  onSurfaceColor: (key: "tileBase" | "tileBaseCorner" | "field" | "plinth" | "accent", value: string) => void;
};

const num = (v: string, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const SURFACE_KEYS = ["field", "plinth", "accent", "tileBase", "tileBaseCorner"] as const;

export default function BoardPanel({ def, onResize, onBoard, onGroupColor, onSurfaceColor }: Props) {
  return (
    <div className="ed-panel">
      <div className="ed-section-title">Layout</div>
      <div className="ed-field">
        <label>Tiles per side (board size)</label>
        <div className="ed-slider-row">
          <input type="range" min={3} max={15} value={def.perSide}
            onChange={(e) => onResize(num(e.target.value, 9))} />
          <span className="ed-slider-val">{def.perSide}×4+4 = {def.perSide * 4 + 4}</span>
        </div>
      </div>

      <div className="ed-section-title">Economy</div>
      <div className="ed-row">
        <div className="ed-field"><label>Starting money</label>
          <input type="number" value={def.startingMoney} onChange={(e) => onBoard({ startingMoney: num(e.target.value, 1500) })} /></div>
        <div className="ed-field"><label>GO salary</label>
          <input type="number" value={def.passGo} onChange={(e) => onBoard({ passGo: num(e.target.value, 200) })} /></div>
      </div>
      <div className="ed-row">
        <div className="ed-field"><label>Currency symbol</label>
          <input type="text" value={def.currency.symbol} maxLength={4}
            onChange={(e) => onBoard({ currency: { ...def.currency, symbol: e.target.value } })} /></div>
        <div className="ed-field"><label>Position</label>
          <select value={def.currency.position}
            onChange={(e) => onBoard({ currency: { ...def.currency, position: e.target.value as "prefix" | "suffix" } })}>
            <option value="prefix">prefix ($100)</option>
            <option value="suffix">suffix (100 €)</option>
          </select></div>
      </div>

      <div className="ed-section-title">Group colours</div>
      {[...GROUP_KEYS, "rail", "util"].map((g) => (
        <div className="ed-color-row" key={g}>
          <span>{g}</span>
          <input type="color" value={def.theme.groupColors[g] || "#888888"}
            onChange={(e) => onGroupColor(g, e.target.value)} />
        </div>
      ))}

      <div className="ed-section-title">Board colours</div>
      {SURFACE_KEYS.map((k) => (
        <div className="ed-color-row" key={k}>
          <span>{k}</span>
          <input type="color" value={(def.theme as any)[k] || "#888888"}
            onChange={(e) => onSurfaceColor(k, e.target.value)} />
        </div>
      ))}
    </div>
  );
}
