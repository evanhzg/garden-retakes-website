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

export function tileFaceTexture(space: any, lang: Lang, boardMeta: any, bt = false): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const T = bt ? 1.42 : 1; // BT view: bigger, clearer on-tile text
  const boardId = boardMeta?.boardId || "classic";
  const theme = resolveTheme(boardMeta?.theme);
  const currency = boardId === "classic" ? null : boardMeta?.currency;

  // Tile-look presets: per-tile override wins over the board-level theme default.
  const faceFill: string = space.fill || boardMeta?.theme?.faceFill || "band";
  const faceBorder: string = space.faceBorder || boardMeta?.theme?.faceBorder || "thin";
  const explicitText: string | undefined = space.textColor || boardMeta?.theme?.textColor;

  // Signature so live edits (name/type/group/price/icon/colours/look) regenerate
  // the texture; during a game these are stable, so it still caches.
  const sig = [space.type, space.name, space.group, space.price, space.icon,
    theme.groupColors[space.group], theme.tileBase, theme.tileBaseCorner,
    space.color, faceFill, faceBorder, explicitText, space.faceStyle,
    boardMeta?.theme?.tileStyle, theme.accent, bt ? "bt" : ""].join("~");
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

  // The tile's signature colour (per-tile override, else its group / accent).
  const tileColor: string | null = space.color
    || (space.type === "property" ? (theme.groupColors as Record<string, string>)[space.group]
      : space.type === "special" ? theme.accent : null);
  const fullFill = !isCorner && faceFill === "full" && !!tileColor;
  const textColor = explicitText || (fullFill ? readableOn(tileColor!) : "#14210f");

  // Base face fill.
  ctx.fillStyle = fullFill ? tileColor! : (isCorner ? theme.tileBaseCorner : theme.tileBase);
  ctx.fillRect(0, 0, W, H);

  // Outline weight.
  if (faceBorder !== "none") {
    const lw = faceBorder === "bold" ? 9 : 4;
    ctx.strokeStyle = faceBorder === "bold" ? "rgba(20,33,15,0.42)" : "rgba(20,33,15,0.18)";
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2 + 1, lw / 2 + 1, W - lw - 2, H - lw - 2);
  }

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (isCorner) {
    ctx.font = "700 96px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
    if (space.id === roles.go && !explicitText) ctx.fillStyle = "#16a34a";
    ctx.fillText(cornerIcon, W / 2, H / 2 - 22);
    ctx.fillStyle = textColor;
    ctx.font = `800 ${Math.round(32 * T)}px 'Segoe UI', sans-serif`;
    wrapText(ctx, tileShortName(space, boardId, lang).toUpperCase(), W / 2, H / 2 + 66, W - 24, Math.round(32 * T), 2, outlineFor(textColor));
    return finalize(canvas, key);
  }

  // Face style preset (per-tile override, else board default).
  const faceStyle = space.faceStyle || boardMeta?.theme?.tileStyle || "standard";
  const minimal = faceStyle === "minimal";
  const bold = faceStyle === "bold";

  // Colour band — only in "band" fill mode ("full" already tints the whole face,
  // "none" shows no colour). Properties/POIs get the band.
  const bandH = bold ? 104 : 84;
  const banded = faceFill === "band" && !!tileColor && (space.type === "property" || space.type === "special");
  if (banded) {
    // BT-style header: a colour block with a soft top highlight and a crisp
    // dark divider under it.
    const grad = ctx.createLinearGradient(0, 0, 0, bandH);
    grad.addColorStop(0, lighten(tileColor!, 0.22));
    grad.addColorStop(1, tileColor!);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, bandH);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(0, 0, W, 4);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(0, bandH - 4, W, 4);
  }
  const contentTop = banded ? bandH : 0;

  const glyph = space.icon
    || (space.type === "special" ? (EFFECT_GLYPH[space.effect?.type] || "✨")
      : space.type === "util" ? (UTIL_GLYPH[space.id] || "🚰")
      : TYPE_GLYPH[space.type]);
  let textTop = contentTop + 26;
  if (glyph && !minimal) {
    ctx.font = "700 76px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
    if (space.type === "chance" && !explicitText && !fullFill) { ctx.fillStyle = "#e8730c"; ctx.font = "900 italic 84px 'Segoe UI', sans-serif"; }
    ctx.fillText(glyph, W / 2, contentTop + 60);
    ctx.fillStyle = textColor;
    textTop = contentTop + 132;
  }
  if (minimal) textTop = H / 2 - 10;

  const priced = space.price != null && !minimal;
  ctx.font = `800 ${Math.round((bold ? 42 : 36) * T)}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = textColor;
  const lineH = Math.round((bold ? 44 : 38) * T);
  // Priced tiles cap the name at 2 lines so the price badge always has room.
  wrapText(ctx, tileShortName(space, boardId, lang), W / 2, textTop, W - 22, lineH, priced ? 2 : 3, outlineFor(textColor));

  // BT-style price badge — a rounded pill along the bottom of the tile.
  if (priced) {
    const label = fmtMoney(space.price, lang, currency);
    ctx.font = `800 ${Math.round(30 * T)}px 'Segoe UI', sans-serif`;
    const tw = ctx.measureText(label).width;
    const ph = Math.round(46 * T);
    const pw = Math.min(W - 18, tw + 40);
    const px = (W - pw) / 2;
    const py = H - ph - 16;
    const pillColor = fullFill ? "rgba(9,15,11,0.72)"
      : (tileColor && (space.type === "property" || space.type === "special") ? tileColor : "#28351f");
    roundRect(ctx, px, py, pw, ph, ph / 2);
    ctx.fillStyle = pillColor; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = fullFill ? "#ffffff" : readableOn(pillColor);
    ctx.fillText(label, W / 2, py + ph / 2 + 1);
  }

  return finalize(canvas, key);
}

// Parse a #rgb / #rrggbb hex into [r,g,b] (0–255), or null if not a hex colour.
function hexRgb(hex: string): [number, number, number] | null {
  const c = hex.replace("#", "");
  const n = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  if (n.length < 6) return null;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return [r, g, b];
}

// Pick dark or light text for legibility on a given fill colour.
function readableOn(hex: string): string {
  const rgb = hexRgb(hex);
  if (!rgb) return "#ffffff";
  const L = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return L > 0.6 ? "#14210f" : "#ffffff";
}

function withAlpha(color: string, a: number): string {
  const rgb = hexRgb(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : color;
}

// Mix a hex colour toward white by `amt` (0..1).
function lighten(hex: string, amt: number): string {
  const rgb = hexRgb(hex);
  if (!rgb) return hex;
  const m = (v: number) => Math.round(v + (255 - v) * amt);
  return `rgb(${m(rgb[0])},${m(rgb[1])},${m(rgb[2])})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function finalize(canvas: HTMLCanvasElement, key: string): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

// Pick an outline colour that contrasts with the given text colour so names stay
// legible over any band / fill colour.
function outlineFor(textHex: string): string {
  const rgb = hexRgb(textHex);
  if (!rgb) return "rgba(0,0,0,0.55)";
  const L = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return L > 0.55 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string, cx: number, top: number,
  maxW: number, lineH: number, maxLines: number, outline?: string
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
  if (outline) { ctx.lineJoin = "round"; ctx.strokeStyle = outline; ctx.lineWidth = 4; }
  rows.slice(0, maxLines).forEach((r, i) => {
    const y = top + i * lineH;
    if (outline) ctx.strokeText(r, cx, y);
    ctx.fillText(r, cx, y);
  });
  return Math.min(rows.length, maxLines);
}
