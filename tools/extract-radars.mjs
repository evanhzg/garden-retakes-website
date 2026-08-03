#!/usr/bin/env node
/**
 * Pull the radar images out of the game and into public/radars/.
 *
 * The utility page draws lineup markers from world coordinates, and the
 * transform in data/mapOverviews.json assumes the game's own 1024x1024 radar.
 * Anything else — a screenshot, a redrawn map — puts every marker slightly
 * wrong, so the images come from the same place the calibration did.
 *
 * Radars ship as .vtex_c, a Source 2 compiled texture (BC-compressed, LZ4 mips),
 * so decoding needs Source2Viewer's CLI. That is a separate download rather than
 * a dependency here: it is ~50 MB of native binaries per platform.
 *
 *   https://github.com/ValveResourceFormat/ValveResourceFormat/releases
 *
 * Point SOURCE2VIEWER at the binary, or drop it in tools/bin/, then:
 *
 *   node tools/extract-radars.mjs                  extract everything
 *   node tools/extract-radars.mjs de_nuke          just one map
 *
 * Re-run it when Valve reworks a map; the files are overwritten in place.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "radars");
const OVERVIEWS = path.join(ROOT, "data", "mapOverviews.json");

/** Where CS2 might be. The first one that exists wins. */
const GAME_CANDIDATES = [
  process.env.CS2_PATH,
  "/mnt/d/Steam/steamapps/common/Counter-Strike Global Offensive",
  "/mnt/c/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive",
  "D:/Steam/steamapps/common/Counter-Strike Global Offensive",
  path.join(os.homedir(), ".steam/steam/steamapps/common/Counter-Strike Global Offensive"),
].filter(Boolean);

const TOOL_CANDIDATES = [
  process.env.SOURCE2VIEWER,
  path.join(ROOT, "tools", "bin", "Source2Viewer-CLI"),
  path.join(ROOT, "tools", "bin", "Source2Viewer-CLI.exe"),
  "Source2Viewer-CLI",
];

function findFirst(candidates, check) {
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (check(c)) return c;
    } catch {
      // Next candidate.
    }
  }
  return null;
}

function findGame() {
  const found = findFirst(GAME_CANDIDATES, (c) => fs.existsSync(path.join(c, "game", "csgo", "pak01_dir.vpk")));
  if (!found) {
    console.error("Could not find CS2. Set CS2_PATH to the folder containing game/csgo/.");
    process.exit(1);
  }
  return path.join(found, "game", "csgo", "pak01_dir.vpk");
}

function findTool() {
  const found = findFirst(TOOL_CANDIDATES, (c) => {
    if (c.includes("/") || c.includes("\\")) return fs.existsSync(c);
    execFileSync(c, ["--version"], { stdio: "ignore" });
    return true;
  });
  if (!found) {
    console.error("Source2Viewer-CLI not found.\n");
    console.error("  1. Download the CLI for your platform:");
    console.error("     https://github.com/ValveResourceFormat/ValveResourceFormat/releases");
    console.error(`  2. Unzip it into ${path.join(ROOT, "tools", "bin")}/ (or set SOURCE2VIEWER)`);
    console.error("  3. Run this again.");
    process.exit(1);
  }
  return found;
}

/** Every radar image this map needs — one per vertical section. */
function assetsFor(name, cfg) {
  const levels = cfg.levels?.map((l) => l.name) ?? ["default"];
  return levels.map((level) => ({
    level,
    // "default" is the plain radar; a named section is <map>_<name>_radar.
    vpkPath: `panorama/images/overheadmaps/${name}${level === "default" ? "" : `_${level}`}_radar_psd.vtex_c`,
    // Flat filenames keep the URL trivial: /radars/de_nuke.png, de_nuke_lower.png
    outName: `${name}${level === "default" ? "" : `_${level}`}.png`,
  }));
}

function main() {
  const only = process.argv[2];
  const vpk = findGame();
  const tool = findTool();
  const doc = JSON.parse(fs.readFileSync(OVERVIEWS, "utf8"));

  fs.mkdirSync(OUT, { recursive: true });
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "radars-"));

  let done = 0;
  let skipped = 0;

  for (const [name, cfg] of Object.entries(doc.maps)) {
    if (only && name !== only) continue;
    if (!cfg.scale) {
      // A map with no calibration would render markers in the wrong place, so
      // its image is not useful yet either.
      console.log(`  ${name}: no calibration yet — skipped`);
      skipped += 1;
      continue;
    }

    for (const asset of assetsFor(name, cfg)) {
      process.stdout.write(`  ${asset.outName} … `);
      try {
        execFileSync(tool, ["-i", vpk, "--vpk_filepath", asset.vpkPath, "-o", staging, "-d"], { stdio: "ignore" });
        const produced = path.join(staging, asset.vpkPath.replace(/\.vtex_c$/, ".png"));
        if (!fs.existsSync(produced)) throw new Error("not in this build of the game");
        fs.copyFileSync(produced, path.join(OUT, asset.outName));
        console.log(`${Math.round(fs.statSync(produced).size / 1024)} KB`);
        done += 1;
      } catch (err) {
        console.log(`skipped (${err.message.split("\n")[0].slice(0, 60)})`);
        skipped += 1;
      }
    }
  }

  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`\n${done} radar(s) in public/radars/${skipped ? `, ${skipped} skipped` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
