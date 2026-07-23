"use client";

import React from "react";
import { type BoardDef, GROUP_KEYS, BUILDING_STYLES, FACE_STYLES, FACE_FILLS, FACE_BORDERS } from "@/components/games/monopoly3d/boardSchema";

type Props = {
  def: BoardDef;
  onResize: (perSide: number) => void;
  onBoard: (patch: Partial<BoardDef>) => void;
  onGroupColor: (key: string, value: string) => void;
  onSurfaceColor: (key: "tileBase" | "tileBaseCorner" | "field" | "plinth" | "accent", value: string) => void;
  onTheme: (patch: any) => void;
};

const num = (v: string, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const SURFACE_KEYS = ["field", "plinth", "accent", "tileBase", "tileBaseCorner"] as const;

export default function BoardPanel({ def, onResize, onBoard, onGroupColor, onSurfaceColor, onTheme }: Props) {
  return (
    <div className="ed-panel">
      <div className="ed-section-title">Layout</div>
      <div className="ed-field">
        <label>Regenerate square board (tiles/side)</label>
        <div className="ed-slider-row">
          <input type="range" min={3} max={15} value={def.perSide}
            onChange={(e) => onResize(num(e.target.value, 9))} />
          <span className="ed-slider-val">{def.tiles.length} tiles</span>
        </div>
      </div>

      <div className="ed-section-title">Style</div>
      <div className="ed-row">
        <div className="ed-field"><label>Houses</label>
          <select value={def.theme.buildingStyle || "classic"} onChange={(e) => onTheme({ buildingStyle: e.target.value })}>
            {BUILDING_STYLES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select></div>
        <div className="ed-field"><label>Tile face</label>
          <select value={def.theme.tileStyle || "standard"} onChange={(e) => onTheme({ tileStyle: e.target.value })}>
            {FACE_STYLES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select></div>
      </div>
      <div className="ed-row">
        <div className="ed-field"><label>Tile fill</label>
          <select value={def.theme.faceFill || "band"} onChange={(e) => onTheme({ faceFill: e.target.value })}>
            {FACE_FILLS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select></div>
        <div className="ed-field"><label>Border</label>
          <select value={def.theme.faceBorder || "thin"} onChange={(e) => onTheme({ faceBorder: e.target.value })}>
            {FACE_BORDERS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select></div>
      </div>
      <div className="ed-color-row">
        <span>Tile text</span>
        <input type="color" value={def.theme.textColor || "#14210f"}
          onChange={(e) => onTheme({ textColor: e.target.value })} />
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
