#!/usr/bin/env node
/**
 * Stage 3 — take the screenshots CS2 left on disk and attach them to lineups.
 *
 * The game names screenshots after the map and a counter and knows nothing
 * about lineup ids, so the only thing linking a file to a lineup is the order
 * it was taken in. That is why drive.ps1 never skips and never retries: the
 * sequence *is* the join, and a missing shot shifts every later one onto the
 * wrong lineup.
 *
 * So this checks the count before it writes anything. With --throw the run
 * produces exactly two files per lineup, without it exactly one; anything else
 * means the run was interrupted or a keystroke was dropped, and pairing on a
 * broken sequence would quietly mislabel most of the map.
 *
 * Images are re-encoded rather than copied. A CS2 screenshot at 2560×1440 is
 * about 900 KB, and 320 of those is a quarter of a gigabyte in a git repo that
 * gets built into a Docker image on every deploy.
 *
 * Usage:
 *   node tools/lineup-capture/ingest.mjs --map de_mirage [--throw] [--dry]
 *   node tools/lineup-capture/ingest.mjs --map de_mirage --since "2026-08-05T10:00"
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const SHOT_DIRS = [
  process.env.CS2_SCREENSHOT_DIR,
  "/mnt/d/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/screenshots",
].filter(Boolean);

const FFMPEG = process.env.FFMPEG_PATH ?? `${process.env.HOME}/projects/garden-highlights/bin/ffmpeg`;

const PUBLIC_ROOT = path.resolve(process.cwd(), "public/lineups");

/**
 * 1280 wide at quality 4.
 *
 * The image is read at roughly a third of the viewport on a desktop and full
 * width on a phone, so anything past 1280 is detail nobody sees at a cost
 * everybody pays. Quality 4 is where JPEG stops smearing the thin high-contrast
 * edges — a crosshair on a skybox — which is the one thing in the frame that
 * has to stay crisp.
 */
const WIDTH = 1280;
const QUALITY = 4;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

function findShotDir() {
  for (const d of SHOT_DIRS) if (fs.existsSync(d)) return d;
  return null;
}

function collectShots(dir, map, since) {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|tga)$/i.test(f))
    // CS2 prefixes the map name, which is what keeps one map's run from
    // absorbing the tail of another's.
    .filter((f) => f.toLowerCase().includes(map.toLowerCase()))
    .map((f) => {
      const full = path.join(dir, f);
      return { file: f, full, mtime: fs.statSync(full).mtimeMs };
    })
    .filter((s) => (since ? s.mtime >= since : true))
    .sort((a, b) => a.mtime - b.mtime);
}

function encode(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync(
    FFMPEG,
    ["-y", "-loglevel", "error", "-i", src, "-vf", `scale=${WIDTH}:-2`, "-q:v", String(QUALITY), dest],
    { stdio: "pipe" }
  );
  return fs.statSync(dest).size;
}

async function main() {
  const map = arg("map");
  if (!map) {
    console.error("--map is required.");
    process.exit(1);
  }
  const withThrow = flag("throw");
  const dry = flag("dry");
  const since = arg("since") ? Date.parse(arg("since")) : null;

  const manifestPath = path.resolve(process.cwd(), `tools/lineup-capture/out/garden_cap_${map}.json`);
  if (!fs.existsSync(manifestPath)) {
    console.error(`No manifest at ${manifestPath} — run generate.mjs first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const shotDir = findShotDir();
  if (!shotDir) {
    console.error(`No screenshot directory found. Looked in:\n  ${SHOT_DIRS.join("\n  ")}`);
    process.exit(1);
  }

  const shots = collectShots(shotDir, map, since);
  const perLineup = withThrow ? 2 : 1;
  const expected = manifest.count * perLineup;

  console.log(`${shots.length} screenshots in ${shotDir}`);
  console.log(`${manifest.count} lineups × ${perLineup} = ${expected} expected`);

  if (shots.length !== expected) {
    console.error(
      `\nCount mismatch — refusing to pair.\n` +
        `The screenshots are matched to lineups by order, so a missing or extra\n` +
        `file shifts every later one onto the wrong lineup. Re-run the capture,\n` +
        `or pass --since to exclude screenshots from an earlier attempt.`
    );
    if (shots.length) {
      const t = new Date(shots[0].mtime).toISOString();
      console.error(`\nOldest matching screenshot: ${shots[0].file} (${t})`);
    }
    process.exit(1);
  }

  if (!fs.existsSync(FFMPEG)) {
    console.error(`ffmpeg not found at ${FFMPEG}. Set FFMPEG_PATH.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    let bytes = 0;
    const updates = [];

    for (let i = 0; i < manifest.count; i++) {
      const l = manifest.lineups[i];
      const aimSrc = shots[i * perLineup];
      const resultSrc = withThrow ? shots[i * perLineup + 1] : null;

      const aimRel = `lineups/${map}/${l.id}-aim.jpg`;
      const resultRel = resultSrc ? `lineups/${map}/${l.id}-result.jpg` : null;

      if (!dry) {
        bytes += encode(aimSrc.full, path.join(PUBLIC_ROOT, map, `${l.id}-aim.jpg`));
        if (resultSrc) bytes += encode(resultSrc.full, path.join(PUBLIC_ROOT, map, `${l.id}-result.jpg`));
      }

      updates.push({ id: l.id, aim: `/${aimRel}`, result: resultRel ? `/${resultRel}` : null });
      console.log(`  ${String(i + 1).padStart(3)} ${l.name} <- ${aimSrc.file}${resultSrc ? ` + ${resultSrc.file}` : ""}`);
    }

    if (dry) {
      console.log("\n--dry: nothing written.");
      return;
    }

    for (const u of updates) {
      await prisma.$executeRawUnsafe(
        "UPDATE GardenNades SET ShotAim = ?, ShotResult = ? WHERE Id = ?",
        u.aim,
        u.result,
        u.id
      );
    }

    console.log(`\n${updates.length} lineups updated. ${(bytes / 1024 / 1024).toFixed(1)} MB written to public/lineups/${map}/`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
