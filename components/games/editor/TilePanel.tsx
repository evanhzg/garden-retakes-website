"use client";

import React from "react";
import { useI18n } from '@/components/I18nProvider';
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
    const { t } = useI18n();

  if (!tile) {
    return (
      <div className="ed-panel right">
        <div className="ed-section-title">{t("auto.tilepanel.tile")}</div>
        <div className="ed-empty">{t("auto.tilepanel.click_a_tile_on_the_3d_board_t")}</div>
      </div>
    );
  }
  const isCorner = tile.type === "corner";

  return (
    <div className="ed-panel right">
      <div className="ed-section-title">{t("auto.tilepanel.tile")}{tile.id}{isCorner ? " · corner" : ""}</div>

      <div className="ed-field">
        <label>{t("auto.tilepanel.name")}</label>
        <input type="text" value={tile.name || ""} onChange={(e) => onPatch({ name: e.target.value })} />
      </div>

      <div className="ed-field">
        <label>{t("auto.tilepanel.icon_emoji_optional")}</label>
        <input type="text" value={tile.icon || ""} maxLength={4} placeholder={t("auto.tilepanel.e_g")}
          onChange={(e) => onPatch({ icon: e.target.value || undefined })} />
      </div>

      {!isCorner && (
        <div className="ed-field">
          <label>{t("auto.tilepanel.type")}</label>
          <select value={tile.type} onChange={(e) => onChangeType(e.target.value as TileType)}>
            {TILE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {tile.type === "property" && (
        <>
          <div className="ed-field">
            <label>{t("auto.tilepanel.colour_group")}</label>
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
            <div className="ed-field"><label>{t("auto.tilepanel.price")}</label>
              <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></div>
            <div className="ed-field"><label>{t("auto.tilepanel.house_cost")}</label>
              <input type="number" value={tile.houseCost ?? 0} onChange={(e) => onPatch({ houseCost: num(e.target.value) })} /></div>
          </div>
          <div className="ed-field">
            <label>{t("auto.tilepanel.rents_base_1_4_houses_hotel")}</label>
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
        <div className="ed-field"><label>{t("auto.tilepanel.price")}</label>
          <input type="number" value={tile.price ?? 0} onChange={(e) => onPatch({ price: num(e.target.value) })} /></div>
      )}

      {tile.type === "tax" && (
        <div className="ed-field"><label>{t("auto.tilepanel.tax_amount")}</label>
          <input type="number" value={tile.amount ?? 0} onChange={(e) => onPatch({ amount: num(e.target.value) })} /></div>
      )}

      {(tile.type === "chance" || tile.type === "chest") && (
        <div className="ed-empty" style={{ padding: "8px 4px" }}>{t("auto.tilepanel.draw_card_tile_no_extra_settin")}</div>
      )}

      {!isCorner && (
        <div className="ed-move-row">
          <button className="ed-btn" onClick={() => onMove(-1)}>{t("auto.tilepanel._move")}</button>
          <button className="ed-btn" onClick={() => onMove(1)}>{t("auto.tilepanel.move")}</button>
        </div>
      )}
    </div>
  );
}
