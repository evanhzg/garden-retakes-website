#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Adjust these if they differ on your machine
const tool = "/home/evan/projects/Garden-website/tools/bin/Source2Viewer-CLI"; 
const vpk = "/home/evan/projects/Garden-website/tools/pak01_dir.vpk";
const testFile = "sounds/vo/agents/balkan_epic/agree_01.vsnd_c";

console.log(`[1] Testing extraction for: ${testFile}`);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "debug-vrf-"));
console.log(`[2] Output directory: ${tempDir}`);

try {
  console.log(`[3] Running Source2Viewer-CLI...`);
  // Notice: no 'stdio: ignore' here, we are capturing everything!
  const output = execFileSync(tool, ["-i", vpk, "--vpk_filepath", testFile, "-o", tempDir, "-d"], { encoding: "utf8" });
  console.log("\n=== TOOL OUTPUT ===");
  console.log(output);
  console.log("===================\n");
} catch (e) {
  console.error("\n=== TOOL CRASHED ===");
  console.error("MESSAGE:", e.message);
  console.error("STDERR:", e.stderr);
  console.error("STDOUT:", e.stdout);
  console.error("====================\n");
}

// See if anything was actually created (recursive scan)
function scanDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  for (const f of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = scanDir(tempDir);
console.log(`[4] Files physically found in temp directory:`);
console.log(files);

// Cleanup
fs.rmSync(tempDir, { recursive: true, force: true });