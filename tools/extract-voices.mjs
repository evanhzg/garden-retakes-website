#!/usr/bin/env node
/**
 * Pull the agent voice lines out of the game and into public/audio/agents/.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "audio", "agents");
const DATA_OUT = path.join(ROOT, "data", "agent_voices_v2.json");

// Removed 'tools' from candidates so it doesn't get tricked by the isolated pak01_dir.vpk
const GAME_CANDIDATES = [
  process.env.CS2_PATH,
  "/mnt/d/Steam/steamapps/common/Counter-Strike Global Offensive",
  "/mnt/c/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive",
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
    } catch { }
  }
  return null;
}

function findGame() {
  // Directly search the candidates, prioritizing the mounted Windows drives in WSL
  const found = findFirst(GAME_CANDIDATES, (c) => fs.existsSync(path.join(c, "game", "csgo", "pak01_dir.vpk")));
  if (!found) {
    console.error("Could not find CS2. Set CS2_PATH to the folder containing game/csgo/.");
    process.exit(1);
  }
  const fullPath = path.join(found, "game", "csgo", "pak01_dir.vpk");
  console.log(`Using VPK from: ${fullPath}`);
  return fullPath;
}

function findTool() {
  const found = findFirst(TOOL_CANDIDATES, (c) => {
    if (c.includes("/") || c.includes("\\")) return fs.existsSync(c);
    execFileSync(c, ["--version"], { stdio: "ignore" });
    return true;
  });
  if (!found) {
    console.error("Source2Viewer-CLI not found.");
    process.exit(1);
  }
  return found;
}

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

const TARGET_COMMANDS = [
  "letsgo", "fallback", "sticktogether", "holdposition", "inposition", 
  "followme", "affirmative", "agree", "negative", "disagree", "cheer", 
  "niceshot", "thanks", "enemyspotted", "needbackup", "coverme", 
  "coveringfriend", "clearedarea", "bombsiteclear", "reportingin", "waitinghere"
];

function main() {
  const vpk = findGame();
  const tool = findTool();

  console.log("Listing VPK contents to find agent voice folders...");
  let listOutput;
  try {
    listOutput = execFileSync(tool, ["-l", "-i", vpk], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 });
  } catch (err) {
    console.error("Failed to list VPK contents:", err.message);
    process.exit(1);
  }

  const lines = listOutput.split("\n");
  const agentFolders = new Set();
  const genericFolders = ["sas", "swat", "professional", "leet", "balkan", "phoenix", "gign", "seal", "separatist", "idf", "gsg9", "fbihrt", "anarchist", "pirate", "ctm_fbi", "ctm_diver", "gendarmerie_male", "jungle_male"];
  
  const filesToExtract = [];

  for (let line of lines) {
    line = line.trim();
    // Use exact casing from the VPK for extraction
    const match = line.match(/sounds\/vo\/agents\/([^\/]+)\/([^\/]+)\.vsnd_c/i);
    if (match) {
      const exactVpkPath = match[0];
      const folder = match[1].toLowerCase();
      const filename = match[2].toLowerCase();
      
      agentFolders.add(folder);
      filesToExtract.push(exactVpkPath);
    }
  }

  console.log(`Found ${agentFolders.size} specific agent folders.`);
  console.log(`Found ${filesToExtract.length} target voice lines. Beginning extraction (this may take a couple of minutes)...`);

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.dirname(DATA_OUT), { recursive: true });

  let done = 0;
  let skipped = 0;
  const db = {};

  for (let i = 0; i < filesToExtract.length; i++) {
    const vpkPath = filesToExtract[i];
    const parts = vpkPath.split("/");
    const folder = parts[parts.length - 2].toLowerCase();
    const baseName = parts[parts.length - 1].replace(/\.vsnd_c$/i, "").toLowerCase();
    const outDir = path.join(OUT, folder);

    fs.mkdirSync(outDir, { recursive: true });
    if (!db[folder]) db[folder] = { faction: folder, sounds: [] };

    // Check if we already have it
    let alreadyExists = false;
    for (const ext of ['.wav', '.mp3', '.aac', '.ogg']) {
      if (fs.existsSync(path.join(outDir, baseName + ext))) {
        alreadyExists = ext;
        break;
      }
    }

    if (alreadyExists) {
      skipped++;
      if (!db[folder].sounds.includes(baseName + alreadyExists)) {
        db[folder].sounds.push(baseName + alreadyExists);
      }
      continue;
    }

    const fileTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-"));

    try {
      execFileSync(tool, ["-i", vpk, "--vpk_filepath", vpkPath, "-o", fileTempDir, "-d"], { stdio: "ignore" });

      const extractedFiles = scanDir(fileTempDir);
      const audioFile = extractedFiles.find(f => 
        ['.wav', '.mp3', '.aac', '.ogg', '.m4a', '.flac'].includes(path.extname(f).toLowerCase())
      );

      if (audioFile) {
        const ext = path.extname(audioFile).toLowerCase();
        const finalName = baseName + ext;
        
        fs.copyFileSync(audioFile, path.join(outDir, finalName));
        db[folder].sounds.push(finalName);
        done++;
        
        console.log(`[${i + 1}/${filesToExtract.length}] Extracted ${folder}/${finalName}`);
      } else {
        console.log(`[${i + 1}/${filesToExtract.length}] Skipped ${folder}/${baseName} (No decompiled audio found)`);
        skipped++;
      }
    } catch (err) {
      console.log(`[${i + 1}/${filesToExtract.length}] Failed ${folder}/${baseName} (VRF Error)`);
      skipped++;
    }

    fs.rmSync(fileTempDir, { recursive: true, force: true });
  }

  fs.writeFileSync(DATA_OUT, JSON.stringify(db, null, 2));

  console.log(`\nProcess Complete! Extracted ${done} voice lines, ${skipped} skipped.`);
  console.log(`Generated mapping in data/agent_voices_v2.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}