// Builds a cached canvas texture for a tile's top face — colour band, name,
// price and a type glyph — from the active board's theme/currency/names. Owner
// outline / mortgage state are drawn as separate 3D elements, so a texture only
// depends on the board id + tile id + language and can be cached.

import * as THREE from "three";
import { fmtMoney, tileShortName, type Lang } from "@/components/games/monopolyData";
import { resolveTheme } from "./theme";

const cache = new Map<string, THREE.CanvasTexture>();

const CORNER_ICON: Record<number, string> = { 0: "→", 10: "🔒", 20: "🅿️", 30: "🚓" };
const TYPE_GLYPH: Record<string, string> = { chance: "?", chest: "🧰", tax: "💸", rail: "🚂" };
const UTIL_GLYPH: Record<number, string> = { 12: "💡", 28: "🚰" };
const EFFECT_GLYPH: Record<string, string> = {
  reward: "🎁", fee: "💸", collectAll: "🤝", payAll: "💰", teleport: "🌀", jail: "🚓",
  extraRoll: "🎲", skipTurn: "⏭️", drawChance: "❓", drawChest: "🧰", safe: "🏖️",
};

export function tileFaceTexture(space: any, lang: Lang, boardMeta: any): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const boardId = boardMeta?.boardId || "classic";
  const theme = resolveTheme(boardMeta?.theme);
  const currency = boardId === "classic" ? null : boardMeta?.currency;
  // Signature so live edits (name/type/group/price/icon/colours) regenerate the
  // texture; during a game these are stable, so it still caches.
  const sig = [space.type, space.name, space.group, space.price, space.icon,
    theme.groupColors[space.group], theme.tileBase, theme.tileBaseCorner].join("~");
  const key = `${boardId}|${space.id}|${lang}|${sig}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const roles = boardMeta?.roles || { go: 0, jail: 10, goToJail: 30, freeParking: 20 };
  const cornerIcon = space.icon
    ? space.icon
    : space.id === roles.go ? "←"        // travel leaves GO toward the bottom row (−X)
    : space.id === roles.jail ? "🔒"
    : space.id === roles.freeParking ? "🅿️"
    : space.id === roles.goToJail ? "🚓"
    : CORNER_ICON[space.id] ?? "•";

  const isCorner = space.type === "corner";
  const W = 256;
  const H = isCorner ? 256 : 338;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = isCorner ? theme.tileBaseCorner : theme.tileBase;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(20,33,15,0.18)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  ctx.fillStyle = "#14210f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (isCorner) {
    ctx.font = "700 96px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
    if (space.id === roles.go) ctx.fillStyle = "#16a34a";
    ctx.fillText(cornerIcon, W / 2, H / 2 - 22);
    ctx.fillStyle = "#14210f";
    ctx.font = "800 30px 'Segoe UI', sans-serif";
    wrapText(ctx, tileShortName(space, boardId, lang).toUpperCase(), W / 2, H / 2 + 66, W - 30, 30, 2);
    return finalize(canvas, key);
  }

  // Face style preset (per-tile override, else board default).
  const faceStyle = space.faceStyle || boardMeta?.theme?.tileStyle || "standard";
  const minimal = faceStyle === "minimal";
  const bold = faceStyle === "bold";

  // Colour band: per-tile override wins; properties use their group colour;
  // special (POI) tiles use their colour or the board accent.
  const band = space.color
    || (space.type === "property" ? (theme.groupColors as Record<string, string>)[space.group]
      : space.type === "special" ? theme.accent : null);
  const bandH = bold ? 100 : 78;
  if (band && (space.type === "property" || space.type === "special")) {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, bandH);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, bandH - 3, W, 3);
  }

  const glyph = space.icon
    || (space.type === "special" ? (EFFECT_GLYPH[space.effect?.type] || "✨")
      : space.type === "util" ? (UTIL_GLYPH[space.id] || "🚰")
      : TYPE_GLYPH[space.type]);
  let textTop = bandH + 26;
  if (glyph && !minimal) {
    ctx.font = "700 76px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
    if (space.type === "chance") { ctx.fillStyle = "#e8730c"; ctx.font = "900 italic 84px 'Segoe UI', sans-serif"; }
    ctx.fillText(glyph, W / 2, bandH + 60);
    ctx.fillStyle = "#14210f";
    textTop = bandH + 132;
  }
  if (minimal) textTop = H / 2 - 10;

  ctx.font = `800 ${bold ? 42 : 34}px 'Segoe UI', sans-serif`;
  const lines = wrapText(ctx, tileShortName(space, boardId, lang), W / 2, textTop, W - 26, bold ? 44 : 36, 3);

  if (space.price != null && !minimal) {
    ctx.fillStyle = "#3b5a2f";
    ctx.font = "800 34px 'Segoe UI', sans-serif";
    ctx.fillText(fmtMoney(space.price, lang, currency), W / 2, textTop + lines * (bold ? 44 : 36) + 26);
  }

  return finalize(canvas, key);
}

function finalize(canvas: HTMLCanvasElement, key: string): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string, cx: number, top: number,
  maxW: number, lineH: number, maxLines: number
): number {
  const words = text.split(" ");
  const rows: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      rows.push(line);
      line = w;
    } else {
      line = test;
    }
    if (rows.length >= maxLines) break;
  }
  if (line && rows.length < maxLines) rows.push(line);
  rows.slice(0, maxLines).forEach((r, i) => ctx.fillText(r, cx, top + i * lineH));
  return Math.min(rows.length, maxLines);
}
