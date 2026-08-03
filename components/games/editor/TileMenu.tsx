"use client";

import React from "react";
import { useI18n } from '@/components/I18nProvider';
import {
  type Tile, type TileType, type Theme, type EffectType,
  GROUP_KEYS, TILE_TYPES, BUILDING_STYLES, FACE_STYLES, FACE_FILLS, FACE_BORDERS, EFFECT_TYPES, EFFECT_LABELS, EFFECT_HAS_AMOUNT,
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
    const { t } = useI18n();

  const isCorner = tile.type === "corner";
  return (
    <div className="tm" onPointerDown={(e) => e.stopPropagation()}>
      <div className="tm-head">
        <span>{t("auto.tilemenu.tile")}{tile.id}{isCorner ? " · corner" : ""}</span>
        <button className="tm-x" onClick={onClose}>✕</button>
      </div>

      <label className="tm-row"><span>{t("auto.tilemenu.name")}</span>
        <input type="text" value={tile.name || ""} onChange={(e) => onPatch({ name: e.target.value })} /></label>
      <label className="tm-row"><span>{t("auto.tilemenu.icon")}</span>
        <input type="text" value={tile.icon || ""} maxLength={4} placeholder="🏠 ✈ ★"
          onChange={(e) => onPatch({ icon: e.target.value || undefined })} /></label>

      {isCorner && (
        <>
          <label className="tm-row"><span>{t("auto.tilemenu.role")}</span>
            <select value={tile.role || "go"} onChange={(e) => onPatch({ role: e.target.value as any })}>
              <option value="go">{t("auto.tilemenu.go")}</option>
              <option value="jail">{t("auto.tilemenu.jail")}</option>
              <option value="freeParking">{t("auto.tilemenu.free_parking")}</option>
              <option value="goToJail">{t("auto.tilemenu.go_to_jail")}</option>
            </select></label>
          <div className="tm-note">{t("auto.tilemenu.roles_stay_unique_picking_one")}</div>
        </>
      )}

      {!isCorner && (
        <label className="tm-row"><span>{t("auto.tilemenu.type")}</span>
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
            <label className="tm-row"><span>{t("auto.tilemenu.price")}</span>
              <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></label>
            <label className="tm-row"><span>{t("auto.tilemenu.house")}</span>
              <input type="number" value={tile.houseCost ?? 0} onChange={(e) => onPatch({ houseCost: num(e.target.value) })} /></label>
          </div>
          <div className="tm-label">{t("auto.tilemenu.rents_base_1_4_hotel")}</div>
          <div className="tm-rents">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input key={i} type="number" value={tile.rent?.[i] ?? 0}
                onChange={(e) => { const rent = [...(tile.rent || [0, 0, 0, 0, 0, 0])]; rent[i] = num(e.target.value); onPatch({ rent }); }} />
            ))}
          </div>
          <label className="tm-row"><span>{t("auto.tilemenu.houses")}</span>
            <select value={tile.buildingStyle || ""} onChange={(e) => onPatch({ buildingStyle: (e.target.value || undefined) as any })}>
              <option value="">{t("auto.tilemenu._board_default")}</option>
              {BUILDING_STYLES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select></label>
        </>
      )}

      {(tile.type === "rail" || tile.type === "util") && (
        <label className="tm-row"><span>{t("auto.tilemenu.price")}</span>
          <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></label>
      )}
      {tile.type === "tax" && (
        <label className="tm-row"><span>{t("auto.tilemenu.tax")}</span>
          <input type="number" value={tile.amount ?? 0} onChange={(e) => onPatch({ amount: num(e.target.value) })} /></label>
      )}

      {tile.type === "special" && (
        <>
          <label className="tm-row"><span>{t("auto.tilemenu.effect")}</span>
            <select value={tile.effect?.type || "reward"}
              onChange={(e) => onPatch({ effect: { ...(tile.effect || { type: "reward" }), type: e.target.value as EffectType } })}>
              {EFFECT_TYPES.map((t) => <option key={t} value={t}>{EFFECT_LABELS[t]}</option>)}
            </select></label>
          {EFFECT_HAS_AMOUNT.has((tile.effect?.type || "reward") as EffectType) && (
            <label className="tm-row"><span>{t("auto.tilemenu.amount")}</span>
              <input type="number" value={tile.effect?.amount ?? 0}
                onChange={(e) => onPatch({ effect: { ...(tile.effect || { type: "reward" }), amount: num(e.target.value) } })} /></label>
          )}
          {tile.effect?.type === "teleport" && (
            <label className="tm-row"><span>{t("auto.tilemenu.to_tile")}</span>
              <input type="number" min={0} max={total - 1} value={tile.effect?.target ?? 0}
                onChange={(e) => onPatch({ effect: { ...(tile.effect || { type: "teleport" }), target: num(e.target.value) } })} /></label>
          )}
        </>
      )}

      {(tile.type === "chance" || tile.type === "chest") && (
        <div className="tm-note">{t("auto.tilemenu.draw_card_tile_no_extra_settin")}</div>
      )}

      {!isCorner && (
        <>
          <div className="tm-2col">
            <label className="tm-row"><span>{t("auto.tilemenu.face")}</span>
              <select value={tile.faceStyle || ""} onChange={(e) => onPatch({ faceStyle: (e.target.value || undefined) as any })}>
                <option value="">{t("auto.tilemenu._default")}</option>
                {FACE_STYLES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select></label>
            <label className="tm-row"><span>{t("auto.tilemenu.fill")}</span>
              <select value={tile.fill || ""} onChange={(e) => onPatch({ fill: (e.target.value || undefined) as any })}>
                <option value="">{t("auto.tilemenu._default")}</option>
                {FACE_FILLS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select></label>
          </div>
          <div className="tm-2col">
            <label className="tm-row"><span>{t("auto.tilemenu.border")}</span>
              <select value={tile.faceBorder || ""} onChange={(e) => onPatch({ faceBorder: (e.target.value || undefined) as any })}>
                <option value="">{t("auto.tilemenu._default")}</option>
                {FACE_BORDERS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></label>
            <label className="tm-row"><span>{t("auto.tilemenu.colour")}</span>
              <input type="color" value={tile.color || "#888888"} onChange={(e) => onPatch({ color: e.target.value })} /></label>
          </div>
          <label className="tm-row"><span>{t("auto.tilemenu.text")}</span>
            <input type="color" value={tile.textColor || "#14210f"} onChange={(e) => onPatch({ textColor: e.target.value })} /></label>
          <div className="tm-actions">
            <button onClick={() => onMove(-1)}>◀</button>
            <button onClick={() => onMove(1)}>▶</button>
            {(tile.color || tile.textColor) && <button onClick={() => onPatch({ color: undefined, textColor: undefined })}>{t("auto.tilemenu.clear")}</button>}
            <button className="tm-del" onClick={onDelete}>{t("auto.tilemenu._delete")}</button>
          </div>
        </>
      )}
    </div>
  );
}
