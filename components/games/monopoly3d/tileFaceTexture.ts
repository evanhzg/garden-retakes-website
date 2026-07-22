// Builds a cached canvas texture for a tile's top face — colour band, localized
// name, price and a type glyph. Same approach as createDiceTexture in
// DiceRoller.tsx. Owner outline / mortgage state are drawn as separate 3D
// elements, so a texture only depends on the tile id + language and can be cached.

import * as THREE from "three";
import { spaceShort, money, type Lang } from "@/components/games/monopolyData";
import { GROUP_COLORS } from "./theme";

const cache = new Map<string, THREE.CanvasTexture>();

const CORNER_ICON: Record<number, string> = { 0: "→", 10: "🔒", 20: "🅿️", 30: "🚓" };
const TYPE_GLYPH: Record<string, string> = { chance: "?", chest: "🧰", tax: "💸", rail: "🚂" };
const UTIL_GLYPH: Record<number, string> = { 12: "💡", 28: "🚰" };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function tileFaceTexture(space: any, lang: Lang): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const key = `${space.id}|${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const isCorner = space.type === "corner";
  const W = 256;
  const H = isCorner ? 256 : 338; // edge tiles are ~1:1.32 (TILE_W:TILE_D)
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // base
  ctx.fillStyle = isCorner ? "#eae3cd" : "#f4efdf";
  ctx.fillRect(0, 0, W, H);
  // subtle inner border
  ctx.strokeStyle = "rgba(20,33,15,0.18)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  ctx.fillStyle = "#14210f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (isCorner) {
    ctx.font = "700 96px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
    if (space.id === 0) ctx.fillStyle = "#16a34a";
    ctx.fillText(CORNER_ICON[space.id] ?? "•", W / 2, H / 2 - 22);
    ctx.fillStyle = "#14210f";
    ctx.font = "800 30px 'Segoe UI', sans-serif";
    wrapText(ctx, spaceShort(space.id, lang).toUpperCase(), W / 2, H / 2 + 66, W - 30, 30, 2);
    return finalize(canvas, key);
  }

  // colour band at the TOP of the canvas → maps to the tile's inner edge.
  const band = GROUP_COLORS[space.group];
  const bandH = 78;
  if (band && space.type === "property") {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, bandH);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, bandH - 3, W, 3);
  }

  // glyph for non-property tiles
  const glyph = space.type === "util" ? UTIL_GLYPH[space.id] : TYPE_GLYPH[space.type];
  let textTop = bandH + 26;
  if (glyph) {
    ctx.font = "700 76px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
    if (space.type === "chance") { ctx.fillStyle = "#e8730c"; ctx.font = "900 italic 84px 'Segoe UI', sans-serif"; }
    ctx.fillText(glyph, W / 2, bandH + 60);
    ctx.fillStyle = "#14210f";
    textTop = bandH + 132;
  }

  // name
  ctx.font = "800 34px 'Segoe UI', sans-serif";
  const lines = wrapText(ctx, spaceShort(space.id, lang), W / 2, textTop, W - 26, 36, 3);

  // price
  if (space.price != null) {
    ctx.fillStyle = "#3b5a2f";
    ctx.font = "800 34px 'Segoe UI', sans-serif";
    ctx.fillText(money(space.price, lang), W / 2, textTop + lines * 36 + 26);
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

// Word-wrap; returns the number of lines drawn.
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
