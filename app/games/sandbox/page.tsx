"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { useGameIdentity } from "@/components/games/hooks";
import {
  type BoardDef, makeBlankBoard, cloneDef, normalizeBoard, defToGameState,
} from "@/components/games/monopoly3d/boardSchema";
import { listBoards } from "@/components/games/editor/boardStore";
import "@/components/games/monopoly.css";
import "./sandbox.css";

const Board3D = dynamic(() => import("@/components/games/monopoly3d/Board3D"), { ssr: false });

// Demo "players" whose colours are used for ownership + a few sample pawns.
const DEMO = [
  { id: "P0", color: "#ef4444", name: "Red", pos: 3 },
  { id: "P1", color: "#3b82f6", name: "Blue", pos: 13 },
  { id: "P2", color: "#22c55e", name: "Green", pos: 23 },
  { id: "P3", color: "#eab308", name: "Yellow", pos: 33 },
];
const BG_THEMES = ["casino", "midnight", "sunset", "neon", "aurora", "charcoal"];
type Tool = "house" | "owner" | "clear";
type Override = { owner?: string; houses?: number; mortgaged?: boolean };

export default function SandboxPage() {
  const steamId = useGameIdentity();
  if (!steamId) return <div className="mono-root" style={{ display: "grid", placeItems: "center" }}><div className="loader" /></div>;
  return (
    <SocketProvider steamId={steamId}>
      <SandboxClient />
    </SocketProvider>
  );
}

function SandboxClient() {
  const { socket } = useSocket();
  const [templates, setTemplates] = useState<BoardDef[]>([]);
  const [saved, setSaved] = useState<BoardDef[]>([]);
  const [def, setDef] = useState<BoardDef>(() => makeBlankBoard(9, "Sandbox Board"));
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [viewMode, setViewMode] = useState<"3d" | "2d" | "bt">("bt");
  const [tool, setTool] = useState<Tool>("house");
  const [ownerIdx, setOwnerIdx] = useState(0);
  const [bgTheme, setBgTheme] = useState("casino");

  useEffect(() => setSaved(listBoards()), []);
  useEffect(() => {
    if (!socket) return;
    const h = (l: BoardDef[]) => setTemplates(l);
    socket.on("board_defs", h);
    socket.emit("get_board_defs");
    return () => { socket.off("board_defs", h); };
  }, [socket]);

  // A fake game state assembled from the board def + the per-tile overrides.
  const gs = useMemo(() => {
    const base = defToGameState(def);
    base.players = DEMO.map((d) => d.id);
    base.playerStates = Object.fromEntries(DEMO.map((d) => [d.id, {
      position: d.pos, money: 1500, color: d.color, name: d.name,
      jailed: false, jailTurns: 0, jailCards: 0, skipNext: false, bankrupt: false, token: 0, team: null,
    }]));
    base.currentTurn = null;
    base.board = base.board.map((t: any) => {
      const o = overrides[t.id];
      return o ? { ...t, owner: o.owner ?? t.owner, houses: o.houses ?? t.houses, mortgaged: o.mortgaged ?? t.mortgaged } : t;
    });
    return base;
  }, [def, overrides]);

  const applyTool = (id: number) => {
    const tile = def.tiles[id];
    if (!tile || !["property", "rail", "util"].includes(tile.type)) return;
    setOverrides((ov) => {
      const cur = ov[id] || {};
      if (tool === "clear") { const n = { ...ov }; delete n[id]; return n; }
      const owner = cur.owner || DEMO[ownerIdx].id;
      if (tool === "owner") return { ...ov, [id]: { ...cur, owner: DEMO[ownerIdx].id } };
      // house tool: cycle 0..5 (5 = hotel) on properties; just claim rail/util
      if (tile.type !== "property") return { ...ov, [id]: { ...cur, owner } };
      return { ...ov, [id]: { ...cur, owner, houses: ((cur.houses ?? 0) + 1) % 6 } };
    });
  };

  const loadBoard = (d: BoardDef) => { setDef(normalizeBoard(cloneDef(d))); setOverrides({}); };
  const onPickBoard = (v: string) => {
    if (v === "__blank") return loadBoard(makeBlankBoard(9, "Sandbox Board"));
    if (v.startsWith("t:")) { const t = templates.find((x) => x.id === v.slice(2)); if (t) loadBoard(t); }
    else if (v.startsWith("s:")) { const b = saved.find((x) => x.id === v.slice(2)); if (b) loadBoard(b); }
  };

  const populate = () => {
    const ov: Record<number, Override> = {};
    def.tiles.filter((t) => ["property", "rail", "util"].includes(t.type)).forEach((t, i) => {
      ov[t.id] = { owner: DEMO[i % DEMO.length].id, houses: t.type === "property" ? i % 6 : 0 };
    });
    setOverrides(ov);
  };

  return (
    <div className="mono-root" data-bg={bgTheme} data-lang="en">
      <header className="mono-topbar">
        <div className="mono-brand"><span className="mono-brand-dot" /> SANDBOX
          <span className="mono-brand-lang">{def.name}</span>
        </div>
        <div className="mono-topbar-right">
          <select className="mono-bg-select" value="" onChange={(e) => { if (e.target.value) onPickBoard(e.target.value); }} title="Load a board">
            <option value="">Board…</option>
            <option value="__blank">Blank 40</option>
            {templates.map((t) => <option key={t.id} value={"t:" + t.id}>{t.name}</option>)}
            {saved.map((b) => <option key={b.id} value={"s:" + b.id}>{b.name} (saved)</option>)}
          </select>
          <div className="mono-view-toggle" role="group" aria-label="View">
            <button className={viewMode === "3d" ? "on" : ""} onClick={() => setViewMode("3d")}>3D</button>
            <button className={viewMode === "2d" ? "on" : ""} onClick={() => setViewMode("2d")}>2D</button>
            <button className={viewMode === "bt" ? "on bt" : "bt"} onClick={() => setViewMode("bt")}>BT</button>
          </div>
          <select className="mono-bg-select" value={bgTheme} onChange={(e) => setBgTheme(e.target.value)} title="Background">
            {BG_THEMES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <a className="mono-exit" href="/board-editor" title="Board editor" style={{ textDecoration: "none" }}>✎</a>
          <a className="mono-exit" href="/" title="Exit" style={{ textDecoration: "none" }}>✕</a>
        </div>
      </header>

      <div className="sbx-tools">
        <div className="sbx-group">
          <button className={tool === "house" ? "on" : ""} onClick={() => setTool("house")}>🏠 Add house/hotel</button>
          <button className={tool === "owner" ? "on" : ""} onClick={() => setTool("owner")}>👤 Set owner</button>
          <button className={tool === "clear" ? "on" : ""} onClick={() => setTool("clear")}>🧹 Clear</button>
        </div>
        <div className="sbx-owners">
          {DEMO.map((d, i) => (
            <button key={d.id} className={`sbx-swatch ${ownerIdx === i ? "on" : ""}`} style={{ background: d.color }} onClick={() => setOwnerIdx(i)} title={d.name} />
          ))}
        </div>
        <button className="sbx-btn" onClick={populate}>Populate all</button>
        <button className="sbx-btn" onClick={() => setOverrides({})}>Reset</button>
        <span className="sbx-hint">
          Click a property to {tool === "house" ? "add a house (5 = hotel)" : tool === "owner" ? "set its owner colour" : "clear it"}.
        </span>
      </div>

      <div className="sbx-board">
        <Board3D
          gameState={gs}
          lang="en"
          boardMeta={gs.boardMeta}
          viewMode={viewMode}
          onSelectSpace={applyTool}
          onHoverSpace={() => {}}
          onHoverEnd={() => {}}
          rollKey={0}
          lastRoll={null}
          onDiceSettled={() => {}}
        />
        <div className="mono-board3d-hint">🖱 {viewMode === "2d" ? "Drag to pan" : viewMode === "bt" ? "Fixed display" : "Drag to orbit"} · scroll to zoom · click a property to edit it</div>
      </div>
    </div>
  );
}
