"use client";

import React from "react";
import { type Tile, type TileType, type Theme, GROUP_KEYS, TILE_TYPES } from "@/components/games/monopoly3d/boardSchema";

type Props = {
  tile: Tile | null;
  theme: Theme;
  onPatch: (patch: Partial<Tile>) => void;
  onChangeType: (type: TileType) => void;
  onMove: (dir: -1 | 1) => void;
};

const num = (v: string, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function TilePanel({ tile, theme, onPatch, onChangeType, onMove }: Props) {
  if (!tile) {
    return (
      <div className="ed-panel right">
        <div className="ed-section-title">Tile</div>
        <div className="ed-empty">Click a tile on the 3D board to personalize it.</div>
      </div>
    );
  }
  const isCorner = tile.type === "corner";

  return (
    <div className="ed-panel right">
      <div className="ed-section-title">Tile #{tile.id}{isCorner ? " · corner" : ""}</div>

      <div className="ed-field">
        <label>Name</label>
        <input type="text" value={tile.name || ""} onChange={(e) => onPatch({ name: e.target.value })} />
      </div>

      <div className="ed-field">
        <label>Icon / emoji (optional)</label>
        <input type="text" value={tile.icon || ""} maxLength={4} placeholder="e.g. 🏠 ✈ ★"
          onChange={(e) => onPatch({ icon: e.target.value || undefined })} />
      </div>

      {!isCorner && (
        <div className="ed-field">
          <label>Type</label>
          <select value={tile.type} onChange={(e) => onChangeType(e.target.value as TileType)}>
            {TILE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {tile.type === "property" && (
        <>
          <div className="ed-field">
            <label>Colour group</label>
            <select value={tile.group || "brown"} onChange={(e) => onPatch({ group: e.target.value })}>
              {GROUP_KEYS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {GROUP_KEYS.map((g) => (
                <button key={g} title={g}
                  onClick={() => onPatch({ group: g })}
                  style={{
                    width: 20, height: 20, borderRadius: 4, cursor: "pointer",
                    background: theme.groupColors[g],
                    border: tile.group === g ? "2px solid #fff" : "1px solid rgba(0,0,0,0.4)",
                  }} />
              ))}
            </div>
          </div>
          <div className="ed-row">
            <div className="ed-field"><label>Price</label>
              <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></div>
            <div className="ed-field"><label>House cost</label>
              <input type="number" value={tile.houseCost ?? 0} onChange={(e) => onPatch({ houseCost: num(e.target.value) })} /></div>
          </div>
          <div className="ed-field">
            <label>Rents (base · 1–4 houses · hotel)</label>
            <div className="ed-rents">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input key={i} type="number" value={tile.rent?.[i] ?? 0}
                  onChange={(e) => {
                    const rent = [...(tile.rent || [0, 0, 0, 0, 0, 0])];
                    rent[i] = num(e.target.value);
                    onPatch({ rent });
                  }} />
              ))}
            </div>
          </div>
        </>
      )}

      {(tile.type === "rail" || tile.type === "util") && (
        <div className="ed-field"><label>Price</label>
          <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></div>
      )}

      {tile.type === "tax" && (
        <div className="ed-field"><label>Tax amount</label>
          <input type="number" value={tile.amount ?? 0} onChange={(e) => onPatch({ amount: num(e.target.value) })} /></div>
      )}

      {(tile.type === "chance" || tile.type === "chest") && (
        <div className="ed-empty" style={{ padding: "8px 4px" }}>Draw-card tile — no extra settings.</div>
      )}

      {!isCorner && (
        <div className="ed-move-row">
          <button className="ed-btn" onClick={() => onMove(-1)}>◀ Move</button>
          <button className="ed-btn" onClick={() => onMove(1)}>Move ▶</button>
        </div>
      )}
    </div>
  );
}
