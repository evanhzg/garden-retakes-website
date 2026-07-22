"use client";

import React from "react";
import {
  type Tile, type TileType, type Theme, type EffectType,
  GROUP_KEYS, TILE_TYPES, BUILDING_STYLES, FACE_STYLES, EFFECT_TYPES, EFFECT_LABELS, EFFECT_HAS_AMOUNT,
} from "@/components/games/monopoly3d/boardSchema";

type Props = {
  tile: Tile;
  theme: Theme;
  total: number;
  onPatch: (patch: Partial<Tile>) => void;
  onChangeType: (type: TileType) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onClose: () => void;
};

const num = (v: string, f = 0) => { const n = Number(v); return Number.isFinite(n) ? n : f; };

export default function TileMenu({ tile, theme, total, onPatch, onChangeType, onMove, onDelete, onClose }: Props) {
  const isCorner = tile.type === "corner";
  return (
    <div className="tm" onPointerDown={(e) => e.stopPropagation()}>
      <div className="tm-head">
        <span>Tile #{tile.id}{isCorner ? " · corner" : ""}</span>
        <button className="tm-x" onClick={onClose}>✕</button>
      </div>

      <label className="tm-row"><span>Name</span>
        <input type="text" value={tile.name || ""} onChange={(e) => onPatch({ name: e.target.value })} /></label>
      <label className="tm-row"><span>Icon</span>
        <input type="text" value={tile.icon || ""} maxLength={4} placeholder="🏠 ✈ ★"
          onChange={(e) => onPatch({ icon: e.target.value || undefined })} /></label>

      {!isCorner && (
        <label className="tm-row"><span>Type</span>
          <select value={tile.type} onChange={(e) => onChangeType(e.target.value as TileType)}>
            {TILE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
      )}

      {tile.type === "property" && (
        <>
          <div className="tm-swatches">
            {GROUP_KEYS.map((g) => (
              <button key={g} title={g} onClick={() => onPatch({ group: g, color: undefined })}
                style={{ background: theme.groupColors[g], outline: tile.group === g && !tile.color ? "2px solid #fff" : "none" }} />
            ))}
          </div>
          <div className="tm-2col">
            <label className="tm-row"><span>Price</span>
              <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></label>
            <label className="tm-row"><span>House</span>
              <input type="number" value={tile.houseCost ?? 0} onChange={(e) => onPatch({ houseCost: num(e.target.value) })} /></label>
          </div>
          <div className="tm-label">Rents (base · 1–4 · hotel)</div>
          <div className="tm-rents">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input key={i} type="number" value={tile.rent?.[i] ?? 0}
                onChange={(e) => { const rent = [...(tile.rent || [0, 0, 0, 0, 0, 0])]; rent[i] = num(e.target.value); onPatch({ rent }); }} />
            ))}
          </div>
          <label className="tm-row"><span>Houses</span>
            <select value={tile.buildingStyle || ""} onChange={(e) => onPatch({ buildingStyle: (e.target.value || undefined) as any })}>
              <option value="">(board default)</option>
              {BUILDING_STYLES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select></label>
        </>
      )}

      {(tile.type === "rail" || tile.type === "util") && (
        <label className="tm-row"><span>Price</span>
          <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></label>
      )}
      {tile.type === "tax" && (
        <label className="tm-row"><span>Tax</span>
          <input type="number" value={tile.amount ?? 0} onChange={(e) => onPatch({ amount: num(e.target.value) })} /></label>
      )}

      {tile.type === "special" && (
        <>
          <label className="tm-row"><span>Effect</span>
            <select value={tile.effect?.type || "reward"}
              onChange={(e) => onPatch({ effect: { ...(tile.effect || { type: "reward" }), type: e.target.value as EffectType } })}>
              {EFFECT_TYPES.map((t) => <option key={t} value={t}>{EFFECT_LABELS[t]}</option>)}
            </select></label>
          {EFFECT_HAS_AMOUNT.has((tile.effect?.type || "reward") as EffectType) && (
            <label className="tm-row"><span>Amount</span>
              <input type="number" value={tile.effect?.amount ?? 0}
                onChange={(e) => onPatch({ effect: { ...(tile.effect || { type: "reward" }), amount: num(e.target.value) } })} /></label>
          )}
          {tile.effect?.type === "teleport" && (
            <label className="tm-row"><span>To tile</span>
              <input type="number" min={0} max={total - 1} value={tile.effect?.target ?? 0}
                onChange={(e) => onPatch({ effect: { ...(tile.effect || { type: "teleport" }), target: num(e.target.value) } })} /></label>
          )}
        </>
      )}

      {(tile.type === "chance" || tile.type === "chest") && (
        <div className="tm-note">Draw-card tile — no extra settings.</div>
      )}

      {!isCorner && (
        <>
          <div className="tm-2col">
            <label className="tm-row"><span>Face</span>
              <select value={tile.faceStyle || ""} onChange={(e) => onPatch({ faceStyle: (e.target.value || undefined) as any })}>
                <option value="">(default)</option>
                {FACE_STYLES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select></label>
            <label className="tm-row"><span>Colour</span>
              <input type="color" value={tile.color || "#888888"} onChange={(e) => onPatch({ color: e.target.value })} /></label>
          </div>
          <div className="tm-actions">
            <button onClick={() => onMove(-1)}>◀</button>
            <button onClick={() => onMove(1)}>▶</button>
            {tile.color && <button onClick={() => onPatch({ color: undefined })}>clear ✎</button>}
            <button className="tm-del" onClick={onDelete}>🗑 Delete</button>
          </div>
        </>
      )}
    </div>
  );
}
