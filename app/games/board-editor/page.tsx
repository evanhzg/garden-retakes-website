"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { useGameIdentity } from "@/components/games/hooks";
import BoardPanel from "@/components/games/editor/BoardPanel";
import TilePanel from "@/components/games/editor/TilePanel";
import TileRibbon from "@/components/games/editor/TileRibbon";
import {
  type BoardDef, type TileType, type Tile,
  makeBlankBoard, cloneDef, resizeBoard, normalizeBoard, moveTile,
  updateTile, coerceTileForType, defToGameState, validateBoardClient, cornerIndicesOf,
} from "@/components/games/monopoly3d/boardSchema";
import { listBoards, saveBoard, deleteBoard, downloadBoard, exportJson, importJson } from "@/components/games/editor/boardStore";
import "@/components/games/editor/editor.css";

const Board3D = dynamic(() => import("@/components/games/monopoly3d/Board3D"), { ssr: false });

export default function BoardEditorPage() {
  const steamId = useGameIdentity();
  if (!steamId) {
    return <div className="ed-root" style={{ display: "grid", placeItems: "center" }}><div className="loader" /></div>;
  }
  return (
    <SocketProvider steamId={steamId}>
      <EditorClient />
    </SocketProvider>
  );
}

function EditorClient() {
  const { socket } = useSocket();
  const [templates, setTemplates] = useState<BoardDef[]>([]);
  const [saved, setSaved] = useState<BoardDef[]>([]);
  const [def, setDef] = useState<BoardDef>(() => makeBlankBoard(9, "My Board"));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSaved(listBoards()), []);
  useEffect(() => {
    if (!socket) return;
    const h = (l: BoardDef[]) => setTemplates(l);
    socket.on("board_defs", h);
    socket.emit("get_board_defs");
    return () => { socket.off("board_defs", h); };
  }, [socket]);

  const gs = useMemo(() => defToGameState(def), [def]);
  const selectedTile: Tile | null = selectedId != null ? def.tiles[selectedId] ?? null : null;
  const validity = useMemo(() => validateBoardClient(def), [def]);

  // ---- mutations ----
  const patchTile = (patch: Partial<Tile>) => { if (selectedId != null) setDef((d) => updateTile(d, selectedId, patch)); };
  const changeType = (type: TileType) => {
    if (selectedId == null) return;
    setDef((d) => ({ ...d, tiles: d.tiles.map((t) => (t.id === selectedId ? coerceTileForType(t, type) : t)) }));
  };
  const moveSelected = (dir: -1 | 1) => {
    if (selectedId == null) return;
    setDef((d) => {
      const corners = new Set(cornerIndicesOf(d.perSide));
      if (corners.has(selectedId)) return d;
      const nc = d.tiles.filter((t) => !corners.has(t.id));
      const pos = nc.findIndex((t) => t.id === selectedId);
      const np = pos + dir;
      if (np < 0 || np >= nc.length) return d;
      const targetId = nc[np].id;
      setSelectedId(targetId);
      return normalizeBoard(moveTile(d, selectedId, targetId));
    });
  };
  const reorder = (fromId: number, toId: number) => {
    setDef((d) => normalizeBoard(moveTile(d, fromId, toId)));
    setSelectedId(toId);
  };
  const resize = (perSide: number) => {
    setDef((d) => resizeBoard(d, perSide));
    setSelectedId((s) => (s != null && s >= perSide * 4 + 4 ? null : s));
  };
  const patchBoard = (patch: Partial<BoardDef>) => setDef((d) => ({ ...d, ...patch }));
  const setGroupColor = (key: string, value: string) =>
    setDef((d) => ({ ...d, theme: { ...d.theme, groupColors: { ...d.theme.groupColors, [key]: value } } }));
  const setSurfaceColor = (key: any, value: string) =>
    setDef((d) => ({ ...d, theme: { ...d.theme, [key]: value } }));

  // ---- toolbar actions ----
  const startFrom = (template: BoardDef | null) => {
    const base = template ? cloneDef(template) : makeBlankBoard(9, "My Board");
    base.id = "custom_" + Math.random().toString(36).slice(2, 8);
    if (template) base.name = `${template.name} Copy`;
    setDef(normalizeBoard(base));
    setSelectedId(null);
  };
  const doSave = () => { saveBoard(def); setSaved(listBoards()); };
  const loadSaved = (id: string) => { const b = saved.find((s) => s.id === id); if (b) { setDef(cloneDef(b)); setSelectedId(null); } };
  const doDelete = () => { deleteBoard(def.id); setSaved(listBoards()); };
  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = importJson(String(reader.result));
      if (res.ok) { setDef(res.def); setSelectedId(null); }
      else alert("Import failed: " + res.error);
    };
    reader.readAsText(file);
  };
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(exportJson(def)); alert("Board JSON copied to clipboard."); }
    catch { downloadBoard(def); }
  };
  const saveAndPlay = () => {
    if (!validity.ok) { alert("Fix this before playing: " + validity.error); return; }
    saveBoard(def);
    window.location.href = "/"; // games hub → create a lobby and pick your board
  };

  return (
    <div className="ed-root">
      {/* toolbar */}
      <div className="ed-toolbar">
        <div className="ed-brand">BOARD <span>EDITOR</span></div>
        <input className="ed-name-input" value={def.name} onChange={(e) => patchBoard({ name: e.target.value })} placeholder="Board name" />

        <select className="ed-select" value="" onChange={(e) => {
          if (e.target.value === "blank") startFrom(null);
          else { const t = templates.find((x) => x.id === e.target.value); if (t) startFrom(t); }
        }}>
          <option value="">New from…</option>
          <option value="blank">Blank</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <button className="ed-btn" onClick={doSave}>💾 Save</button>
        <select className="ed-select" value="" onChange={(e) => { if (e.target.value) loadSaved(e.target.value); }}>
          <option value="">Load saved…</option>
          {saved.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <button className="ed-btn" onClick={copyJson}>Copy JSON</button>
        <button className="ed-btn" onClick={() => downloadBoard(def)}>Download</button>
        <button className="ed-btn" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.currentTarget.value = ""; }} />
        <button className="ed-btn danger" onClick={doDelete}>Delete</button>

        <div className="ed-spacer" />
        <span className={`ed-status ${validity.ok ? "ok" : "bad"}`}>{validity.ok ? "✓ valid" : "✕ " + validity.error}</span>
        <button className="ed-btn primary" onClick={saveAndPlay}>Save &amp; Play →</button>
        <button className="ed-btn" onClick={() => (window.location.href = "/")}>Exit</button>
      </div>

      {/* body */}
      <div className="ed-body">
        <BoardPanel def={def} onResize={resize} onBoard={patchBoard} onGroupColor={setGroupColor} onSurfaceColor={setSurfaceColor} />

        <div className="ed-board3d">
          <Board3D
            gameState={gs}
            lang="en"
            boardMeta={gs.boardMeta}
            editable
            selectedId={selectedId}
            onSelectTile={setSelectedId}
            onReorder={reorder}
            onSelectSpace={() => {}}
            onHoverSpace={() => {}}
            onHoverEnd={() => {}}
            rollKey={0}
            lastRoll={null}
            onDiceSettled={() => {}}
          />
          <div className="ed-hint">🖱 Click a tile to edit · drag a tile to reorder · drag empty space to orbit</div>
        </div>

        <TilePanel tile={selectedTile} theme={def.theme} onPatch={patchTile} onChangeType={changeType} onMove={moveSelected} />
      </div>

      {/* ribbon */}
      <TileRibbon def={def} selectedId={selectedId} onSelect={setSelectedId} onReorder={reorder} />
    </div>
  );
}
