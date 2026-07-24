"use client";

import React, { useState } from "react";
import { type BoardDef, cornerIndicesOf } from "@/components/games/monopoly3d/boardSchema";

type Props = {
  def: BoardDef;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onReorder: (fromId: number, toId: number) => void;
};

function chipColor(tile: any, def: BoardDef): string {
  const gc = def.theme.groupColors;
  if (tile.type === "property") return gc[tile.group] || "#888";
  if (tile.type === "rail") return gc.rail || "#334155";
  if (tile.type === "util") return gc.util || "#64748b";
  if (tile.type === "corner") return def.theme.accent;
  if (tile.type === "chance") return "#e8730c";
  if (tile.type === "chest") return "#eab308";
  if (tile.type === "tax") return "#94a3b8";
  return "#64748b";
}

export default function TileRibbon({ def, selectedId, onSelect, onReorder }: Props) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const corners = new Set(cornerIndicesOf(def.perSide));

  return (
    <div className="ed-ribbon">
      {def.tiles.map((tile) => {
        const isCorner = corners.has(tile.id);
        return (
          <div
            key={tile.id}
            className={`ed-chip ${isCorner ? "corner" : ""} ${selectedId === tile.id ? "selected" : ""} ${overId === tile.id ? "dragover" : ""}`}
            draggable={!isCorner}
            onClick={() => onSelect(tile.id)}
            onDragStart={(e) => { setDragId(tile.id); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); if (dragId != null) setOverId(tile.id); }}
            onDragLeave={() => setOverId((o) => (o === tile.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId != null && dragId !== tile.id) onReorder(dragId, tile.id);
              setDragId(null); setOverId(null);
            }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            title={tile.name}
          >
            <span className="ed-chip-bar" style={{ background: chipColor(tile, def) }} />
            <span className="ed-chip-idx">{tile.id}</span>
            <span className="ed-chip-name">{tile.icon ? tile.icon + " " : ""}{tile.name || tile.type}</span>
          </div>
        );
      })}
    </div>
  );
}
