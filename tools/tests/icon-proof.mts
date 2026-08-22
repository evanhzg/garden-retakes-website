/**
 * Render every hand-drawn glyph to a static page, so they can be looked at.
 *
 * Not a test — it asserts nothing. Icons are the one thing in this repo whose
 * correctness is entirely visual: a path with a sign error still compiles, still
 * type-checks, and still renders a shape, just the wrong one. So this writes the
 * whole set at two sizes on both themes and leaves an HTML file to open.
 *
 *   node --import ... tools/tests/icon-proof.mts   (see tools/tests/run.mjs)
 *
 * Deliberately not named *.test.mts: the runner picks those up, and a file that
 * can never fail does not belong in a pass/fail count.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InventoryIcon from "@/components/inventory/InventoryIcon";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import fs from "node:fs";

const INVENTORY_IDS = [
  "rifles", "snipers", "smgs", "pistols", "heavy", "knives", "gloves", "agents",
  "musickits", "alltypes",
  "equip", "share", "import", "vault", "random", "edit", "star", "duplicate",
  "delete", "rename", "close",
];

const RETAKES_IDS = [
  // roles
  "sniper", "lurker", "rifler", "anchor", "rotator",
  // utility
  "smoke", "flash", "molotov", "he",
  // gear
  "kevlar", "helmet", "kit",
  // round types
  "pistol", "force", "full",
  // party and matchmaking
  "party", "invite", "kick", "leave", "matchroom", "connect",
  // veto
  "ban", "pick",
  // modes
  "premium", "testing",
  // rail tabs
  "play", "loadout", "maps", "matches", "live",
];

const SETS: { name: string; Icon: React.ComponentType<any>; ids: string[] }[] = [
  { name: "Inventory", Icon: InventoryIcon, ids: INVENTORY_IDS },
  { name: "Retakes", Icon: RetakesIcon, ids: RETAKES_IDS },
];

const cells = (size: number) =>
  SETS.map(({ name, Icon, ids }) => {
    const row = ids
      .map((id) => {
        const svg = renderToStaticMarkup(React.createElement(Icon, { id, size, title: id }));
        return `<div class="cell">${svg}<div class="name">${id}</div></div>`;
      })
      .join("");
    return `<h3>${name}</h3><div class="row">${row}</div>`;
  }).join("");

const total = SETS.reduce((n, s) => n + s.ids.length, 0);

const page = `<!doctype html>
<meta charset="utf-8"><title>Glyphs</title>
<style>
  body { background:#f3f2f2; color:#201e1d; font:13px system-ui,sans-serif; margin:0; padding:20px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#777; margin:22px 0 8px; }
  h3 { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#999; margin:12px 0 6px; font-weight:600; }
  .row { display:flex; flex-wrap:wrap; gap:10px; }
  .cell { width:92px; text-align:center; background:#eae9e9; padding:10px 4px 6px; }
  .name { margin-top:6px; font-size:10px; color:#666; }
  .dark { background:#201e1d; color:#f3f2f2; margin:24px -20px -20px; padding:20px; }
  .dark .cell { background:#2c2a29; } .dark .name { color:#999; } .dark h3 { color:#777; }
  .accent .cell { color:#ec3013; }
</style>
<h2>20px — the size the rail uses</h2><div class="row">${cells(20)}</div>
<h2>48px — shape check</h2><div class="row">${cells(48)}</div>
<h2>48px on the accent colour</h2><div class="accent">${cells(48)}</div>
<div class="dark"><h2>dark theme, 48px</h2>${cells(48)}</div>
`;

const out = process.argv[2] ?? "/tmp/glyphs.html";
fs.writeFileSync(out, page);
console.log("wrote " + out + " (" + total + " glyphs)");
