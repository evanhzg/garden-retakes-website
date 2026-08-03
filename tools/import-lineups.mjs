#!/usr/bin/env node
/**
 * Import grenade lineups from a JSON export into GardenNades.
 *
 *   node tools/import-lineups.mjs lineups.json [--replace]
 *
 * The export format is one object per lineup with a display map name, a name, a
 * throw type, a click type, and "x y z" strings for position and angle.
 *
 * Two things are worked out here rather than trusted:
 *
 *   - grenade type, area and team come from the lineup's name, because the
 *     export does not carry them and the page needs all three to be useful;
 *   - Verified is set by testing the stand position against the map's radar.
 *     Radar pixels outside the playable area are transparent, so a lineup that
 *     lands on one cannot be stood on. Imported data is not always measured
 *     in-game, and a lineup that teleports you into the void at a LAN is worse
 *     than one that is simply missing.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prisma = new PrismaClient();

/** Display names as they appear in exports → the map's real name. */
const MAP_NAMES = {
  mirage: "de_mirage",
  ancient: "de_ancient",
  inferno: "de_inferno",
  "dust 2": "de_dust2",
  dust2: "de_dust2",
  "dust ii": "de_dust2",
  nuke: "de_nuke",
  vertigo: "de_vertigo",
  overpass: "de_overpass",
  anubis: "de_anubis",
  cache: "de_cache",
  train: "de_train",
};

/** The grenade is named in the lineup's title; nothing else carries it. */
function utilityOf(name) {
  const n = name.toLowerCase();
  if (/\bflash|flashbang\b/.test(n)) return "flash";
  if (/\bmolly|molotov|incend/.test(n)) return "molotov";
  if (/\bhe\b|grenade\b|frag/.test(n)) return "he";
  if (/\bdecoy\b/.test(n)) return "decoy";
  return "smoke";
}

/**
 * "T Spawn to Connector Smoke" → area "T Spawn".
 * The half before "to" is where you throw *from*, which is what groups the list
 * and what makes several Long lineups tellable apart.
 */
function areaOf(name) {
  const withoutType = name.replace(/\s+(smoke|flash|molly|molotov|he|decoy)\s*$/i, "");
  const [from] = withoutType.split(/\s+to\s+/i);
  return (from ?? "").replace(/\s+instant$/i, "").trim().slice(0, 64);
}

function teamOf(name) {
  const n = name.toLowerCase();
  if (/^ct\b|\bct spawn\b/.test(n)) return "CT";
  if (/^t\b|\bt spawn\b|\bt roof\b|\bt outside\b/.test(n)) return "T";
  return "";
}

/** "Step-Jumpthrow" → step-jump; the page shows this as an instruction. */
function throwTypeOf(raw) {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("step")) return "step-jump";
  if (t.includes("jump")) return "jump";
  if (t.includes("run")) return "run";
  if (t.includes("crouch")) return "crouch";
  return "standing";
}

function clickTypeOf(raw) {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("both")) return "both";
  if (t.includes("right")) return "right";
  return "left";
}

const nums = (s) => String(s ?? "").trim().split(/[\s,]+/).map(Number);

/**
 * Is this position somewhere a player can stand?
 *
 * Decoding a PNG properly would mean a dependency; the radars are known to be
 * 1024x1024 RGBA, so the alpha channel is read directly. Only the IDAT needs
 * inflating, which node can do.
 */
function radarAlphaTester(mapName) {
  const file = path.join(ROOT, "public", "radars", `${mapName}.png`);
  if (!fs.existsSync(file)) return null;

  const zlib = require("node:zlib");
  const buf = fs.readFileSync(file);
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  // Only true-colour 8-bit RGBA is handled; anything else is not our extractor's
  // output, and guessing would be worse than declining to check.
  if (colorType !== 6 || bitDepth !== 8) return null;

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline PNG filters.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }

  return (px, py) => {
    // Sample a neighbourhood: a lineup can legitimately be flush against a wall.
    for (const dx of [-6, 0, 6]) {
      for (const dy of [-6, 0, 6]) {
        const x = Math.round(px + dx);
        const y = Math.round(py + dy);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (out[y * stride + x * bpp + 3] > 16) return true;
      }
    }
    return false;
  };
}

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: node tools/import-lineups.mjs <lineups.json> [--replace]");
    process.exit(1);
  }
  const replace = process.argv.includes("--replace");
  const rows = JSON.parse(fs.readFileSync(src, "utf8"));
  const overviews = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "mapOverviews.json"), "utf8"));

  const testers = new Map();
  const testerFor = (map) => {
    if (!testers.has(map)) testers.set(map, radarAlphaTester(map));
    return testers.get(map);
  };

  const prepared = [];
  const skipped = [];

  for (const row of rows) {
    const map = MAP_NAMES[String(row.map ?? "").toLowerCase().trim()];
    if (!map) {
      skipped.push(`${row.map}: unknown map`);
      continue;
    }
    const [sx, sy, sz] = nums(row.position);
    const [pitch, yaw] = nums(row.angle);
    if (![sx, sy, sz, pitch, yaw].every(Number.isFinite)) {
      skipped.push(`${row.name}: unreadable position/angle`);
      continue;
    }

    const cfg = overviews.maps[map];
    let verified = true;
    const test = testerFor(map);
    if (cfg?.scale && test) {
      const px = (sx - cfg.posX) / cfg.scale;
      const py = (cfg.posY - sy) / cfg.scale;
      verified = test(px, py);
    }

    prepared.push({
      Map: map,
      Name: String(row.name ?? "Lineup").slice(0, 120),
      Area: areaOf(String(row.name ?? "")),
      Utility: utilityOf(String(row.name ?? "")),
      Purpose: /instant/i.test(row.name ?? "") ? "default" : "execute",
      Team: teamOf(String(row.name ?? "")),
      ThrowType: throwTypeOf(row.throw_type),
      ClickType: clickTypeOf(row.click_type),
      StandX: sx,
      StandY: sy,
      StandZ: sz,
      Pitch: pitch,
      Yaw: yaw,
      Verified: verified,
      Source: "import",
    });
  }

  if (replace) {
    const gone = await prisma.gardenNade.deleteMany({ where: { Source: "import" } });
    console.log(`removed ${gone.count} previously imported lineup(s)`);
  }

  await prisma.gardenNade.createMany({ data: prepared });

  const bad = prepared.filter((p) => !p.Verified).length;
  const byMap = prepared.reduce((acc, p) => ({ ...acc, [p.Map]: (acc[p.Map] ?? 0) + 1 }), {});
  console.log(`\nimported ${prepared.length} lineup(s):`);
  for (const [m, n] of Object.entries(byMap).sort()) console.log(`  ${m.padEnd(13)} ${n}`);
  console.log(`\n${prepared.length - bad} verified on playable geometry, ${bad} flagged unverified`);
  for (const s of skipped) console.log(`  skipped — ${s}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
