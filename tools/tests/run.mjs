#!/usr/bin/env node
/**
 * The checks behind the 3D viewer and its physics.
 *
 *   node tools/tests/run.mjs
 *
 * These exist because the parts most likely to be wrong here are the ones a
 * screenshot cannot tell you about. A grenade that bounces off the far wall of
 * a doorway looks fine; a smoke that leaks through the seam where two walls
 * meet looks fine; a world-to-scene transform that is a quarter-map out looks
 * entirely plausible. Each of those is a case below.
 *
 * Plain node, no test framework: these assert numeric facts about pure
 * functions, and the repository has no JS test runner to belong to. Adding one
 * for six files would be a bigger decision than the files are.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOADER = pathToFileURL(path.join(HERE, "..", "_alias-loader.mjs")).href;

const files = readdirSync(HERE).filter((f) => f.endsWith(".test.mts")).sort();
let failed = 0;

for (const file of files) {
  console.log(`\n\x1b[1m── ${file}\x1b[0m`);
  const run = spawnSync(
    process.execPath,
    ["--import", `data:text/javascript,import{register}from"node:module";register(${JSON.stringify(LOADER)})`,
     path.join(HERE, file)],
    { encoding: "utf8" },
  );

  // Node's own module-system chatter is not the test's output.
  const noise = /ExperimentalWarning|trace-warnings|Reparsing as ES module|To eliminate this warning|MODULE_TYPELESS_PACKAGE_JSON|^\(node:/;
  const out = (run.stdout + run.stderr).split("\n").filter((l) => l.trim() && !noise.test(l));
  console.log(out.join("\n"));

  if (run.status !== 0) failed++;
}

console.log(
  failed
    ? `\n\x1b[31m${failed} of ${files.length} files failed\x1b[0m`
    : `\n\x1b[32mall ${files.length} files passed\x1b[0m`,
);
process.exit(failed ? 1 : 0);
