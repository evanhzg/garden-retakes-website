#!/usr/bin/env node
/**
 * Score the grenade simulator against arcs somebody actually threw.
 *
 * The simulator's constants are the community-established CS:GO/CS2 values.
 * That is a reasonable starting point and it is not evidence. This turns it
 * into evidence: replay every recorded arc we have through the simulator from
 * its own measured start, and measure how far the simulation ends from where
 * the real grenade ended.
 *
 * That number is the feature working or not. It is also what makes changing a
 * constant a decision rather than a preference — a sweep that lowers the median
 * error is an improvement, and one that does not is somebody's taste.
 *
 *   node tools/fit-grenade-constants.mjs de_mirage
 *   node tools/fit-grenade-constants.mjs de_mirage --sweep restitution 0.3 0.7 0.05
 *
 * Needs two things: `public/maps3d/<map>.mesh` (see tools/convert-map-mesh.mjs)
 * and the database, which is where the recorded arcs live. It will say which of
 * the two is missing rather than failing obscurely.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The very same modules the browser runs.
 *
 * Imported rather than reimplemented on purpose: a scoring tool with its own
 * copy of the physics scores its copy, and the two drift the first time
 * somebody fixes one of them.
 *
 * Node strips the TypeScript itself; the loader registered here only teaches it
 * the `@/` alias those files use.
 */
async function loadLibs() {
  const { register } = await import("node:module");
  register(pathToFileURL(path.join(ROOT, "tools", "_alias-loader.mjs")).href);

  return {
    ...(await import(pathToFileURL(path.join(ROOT, "lib/utility3d.ts")).href)),
    ...(await import(pathToFileURL(path.join(ROOT, "lib/mapCollision.ts")).href)),
    ...(await import(pathToFileURL(path.join(ROOT, "lib/grenadeSim.ts")).href)),
  };
}

function parseArgs(argv) {
  const [map, ...rest] = argv;
  const options = { map, sweep: null };

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--sweep") {
      const [key, from, to, step] = rest.slice(i + 1, i + 5);
      if (!key || [from, to, step].some((n) => !Number.isFinite(Number(n)))) {
        throw new Error("--sweep needs <constant> <from> <to> <step>");
      }
      options.sweep = { key, from: Number(from), to: Number(to), step: Number(step) };
      i += 4;
    }
  }

  return options;
}

/** Median rather than mean: one arc recorded through a wall should not set the score. */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.map) {
    console.error("usage: node tools/fit-grenade-constants.mjs <map> [--sweep <constant> <from> <to> <step>]");
    process.exit(2);
  }

  const meshPath = path.join(ROOT, "public", "maps3d", `${options.map}.mesh`);
  if (!fs.existsSync(meshPath)) {
    console.error(
      `No mesh for ${options.map}.\n` +
        `Export world_physics.vmdl_c with Source 2 Viewer, then:\n` +
        `  node tools/convert-map-mesh.mjs ${options.map} <that file>`,
    );
    process.exit(1);
  }

  const { decodeMapMesh, CollisionIndex, resimulate, endpointError, DEFAULT_CONSTANTS } = await loadLibs();

  const bytes = fs.readFileSync(meshPath);
  const mesh = decodeMapMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const world = new CollisionIndex(mesh);
  console.log(`${options.map}: ${mesh.triangles.toLocaleString()} triangles indexed`);

  const { prisma } = await import(pathToFileURL(path.join(ROOT, "lib/db.ts")).href);
  const rows = await prisma.gardenNade.findMany({
    where: { Map: options.map, Path: { not: null } },
    select: { Id: true, Name: true, Utility: true, Path: true },
  });

  const recordings = rows
    .map((r) => {
      try {
        const path = JSON.parse(r.Path);
        return Array.isArray(path) && path.length >= 2 ? { ...r, path } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (recordings.length === 0) {
    console.error(
      `No recorded arcs for ${options.map}. Capture some in game (they are recorded\n` +
        "automatically), or run the demo importer, which now samples flight paths.",
    );
    process.exit(1);
  }

  console.log(`${recordings.length} recorded arcs to score against\n`);

  const score = (constants) => {
    const errors = [];
    for (const rec of recordings) {
      // A molotov has no fuse — it burns where it stops — so it is simulated to
      // rest. Everything else detonates on its timer.
      const fuse = rec.Utility === "molly" ? Infinity : 1.5;
      const sim = resimulate(rec.path, world, fuse, constants);
      if (!sim) continue;
      const err = endpointError(sim, rec.path);
      if (err !== null && Number.isFinite(err)) errors.push(err);
    }
    return errors;
  };

  if (!options.sweep) {
    const errors = score(DEFAULT_CONSTANTS);
    console.log("Current constants:");
    for (const [k, v] of Object.entries(DEFAULT_CONSTANTS)) console.log(`  ${k.padEnd(14)} ${v}`);
    console.log("");
    console.log(`  scored          ${errors.length}/${recordings.length}`);
    console.log(`  median error    ${median(errors)?.toFixed(1)} units`);
    console.log(`  90th percentile ${percentile(errors, 90)?.toFixed(1)} units`);
    console.log(`  worst           ${Math.max(...errors).toFixed(1)} units`);
    console.log("");
    // A smoke is 144 units across, so landing within about a third of that is
    // the same smoke as far as anyone using it is concerned.
    const good = errors.filter((e) => e < 48).length;
    console.log(`  ${good}/${errors.length} within 48 units — close enough to be the same smoke`);
    await prisma.$disconnect();
    return;
  }

  const { key, from, to, step } = options.sweep;
  if (!(key in DEFAULT_CONSTANTS)) {
    console.error(`No constant called "${key}". Try one of: ${Object.keys(DEFAULT_CONSTANTS).join(", ")}`);
    process.exit(2);
  }

  console.log(`Sweeping ${key} from ${from} to ${to} in steps of ${step}\n`);
  console.log(`  ${key.padEnd(10)}  median   p90     within 48u`);

  let best = null;
  for (let value = from; value <= to + 1e-9; value += step) {
    const errors = score({ ...DEFAULT_CONSTANTS, [key]: value });
    const m = median(errors);
    if (m === null) continue;

    const within = errors.filter((e) => e < 48).length;
    const mark = best === null || m < best.median ? " <-" : "";
    if (best === null || m < best.median) best = { value, median: m };

    console.log(
      `  ${value.toFixed(3).padEnd(10)}  ${m.toFixed(1).padStart(6)}  ` +
        `${percentile(errors, 90).toFixed(1).padStart(6)}  ${String(within).padStart(4)}/${errors.length}${mark}`,
    );
  }

  console.log("");
  console.log(`Best ${key}: ${best.value.toFixed(3)} at a median of ${best.median.toFixed(1)} units.`);
  console.log(
    "That is one constant at a time against a fixed rest, so it is a direction\n" +
      "rather than an optimum — they interact. Sweep the others before settling.",
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
