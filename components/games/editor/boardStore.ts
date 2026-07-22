// Browser-local persistence for user-authored boards. Boards live in
// localStorage as JSON; export/import moves them between browsers. The socket
// server re-validates any board before a game actually uses it.

import { type BoardDef, normalizeBoard, validateBoardClient } from "@/components/games/monopoly3d/boardSchema";

const LS_KEY = "mono_custom_boards";

export function listBoards(): BoardDef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(boards: BoardDef[]) {
  window.localStorage.setItem(LS_KEY, JSON.stringify(boards));
}

export function saveBoard(def: BoardDef): void {
  const boards = listBoards();
  const i = boards.findIndex((b) => b.id === def.id);
  if (i >= 0) boards[i] = def;
  else boards.push(def);
  writeAll(boards);
}

export function deleteBoard(id: string): void {
  writeAll(listBoards().filter((b) => b.id !== id));
}

export function getBoard(id: string): BoardDef | null {
  return listBoards().find((b) => b.id === id) || null;
}

// Export → pretty JSON string.
export function exportJson(def: BoardDef): string {
  return JSON.stringify(def, null, 2);
}

// Trigger a file download of the board JSON.
export function downloadBoard(def: BoardDef): void {
  const blob = new Blob([exportJson(def)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(def.name || "board").replace(/[^\w-]+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Parse + normalize + validate imported JSON.
export function importJson(text: string): { ok: true; def: BoardDef } | { ok: false; error: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "not a board" };
  const def = normalizeBoard(parsed as BoardDef);
  const v = validateBoardClient(def);
  if (!v.ok) return { ok: false, error: v.error || "invalid board" };
  return { ok: true, def };
}
