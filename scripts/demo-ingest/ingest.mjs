#!/usr/bin/env node
/**
 * Local FACEIT demo ingest.
 *
 *   node scripts/demo-ingest/ingest.mjs --player <nickname> --matches 20
 *   node scripts/demo-ingest/ingest.mjs --band-sweep --per-band 40
 *   node scripts/demo-ingest/ingest.mjs --local ./demos           (already-downloaded .dem)
 *
 * Runs entirely on this machine — no server involvement — and writes two small
 * artefacts the website reads:
 *
 *   data/benchmarks/faceit.json   percentile ladders per skill band
 *   data/benchmarks/nades.json    grenade landing clusters per map
 *
 * Demos themselves are cached under .demo-cache/ and are never committed.
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

import { parseDemo } from "./parse.mjs";
import { buildBenchmark, buildNadeClusters, metricsOfRows, writeJson } from "./benchmark.mjs";
import { playerByNickname, matchHistory, matchDetails, demoUrls, matchAverageElo, bandOf } from "./faceit.mjs";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".demo-cache");
const OUT = path.join(ROOT, "data", "benchmarks");

/**
 * Load .env into process.env.
 *
 * Next.js does this for the app, but a standalone node script gets nothing —
 * so running this the way the README documents reported "FACEIT_API_KEY is not
 * set" even when it was sitting in .env. Kept dependency-free rather than
 * pulling in dotenv for one file.
 *
 * Real environment variables always win, so `FACEIT_API_KEY=x node ...` still
 * overrides the file.
 */
function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      // Strip one matching pair of surrounding quotes.
      const q = value[0];
      if ((q === '"' || q === "'") && value.endsWith(q) && value.length > 1) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
loadEnv();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const has = (name) => process.argv.includes(`--${name}`);

const log = (...a) => console.log("·", ...a);
const warn = (...a) => console.warn("!", ...a);

/**
 * Node's fetch reports every network problem as the bare string "fetch failed"
 * and hides the real reason on `.cause`, which makes a failed run impossible to
 * diagnose. Unwrap it and name the common causes.
 */
function describe(e) {
  const cause = e?.cause;
  const code = cause?.code ?? e?.code;
  const detail = cause?.message ?? "";

  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `cannot resolve ${cause?.hostname ?? "the demo CDN"} — DNS/network blocked (${code})`;
  }
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") {
    return `connection dropped mid-download (${code}) — usually transient, re-run`;
  }
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return `timed out reaching the demo CDN (${code})`;
  }
  if (code === "ENOSPC") return "out of disk space while writing the demo";
  return detail ? `${e.message} — ${detail}` : e?.message ?? String(e);
}

/**
 * Downloads and decompresses a FACEIT demo.
 *
 * FACEIT serves CS2 demos as `.dem.zst` (Zstandard) from a Backblaze CDN —
 * the old `.dem.gz` form is CS:GO-era. Node gained native zstd streams in
 * 22.15, which is why this needs Node 22.15+; there is no dependency for it.
 */
async function fetchDemo(url, id) {
  fs.mkdirSync(CACHE, { recursive: true });
  const dest = path.join(CACHE, `${id}.dem`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`demo download ${res.status}`);

  let decompress = null;
  if (url.endsWith(".zst")) {
    if (typeof zlib.createZstdDecompress !== "function") {
      throw new Error(`this demo is .zst and Node ${process.version} has no zstd — needs 22.15+`);
    }
    decompress = zlib.createZstdDecompress();
  } else if (url.endsWith(".gz")) {
    decompress = zlib.createGunzip();
  }

  const tmp = `${dest}.part`;
  const body = Readable.fromWeb(res.body);
  await (decompress
    ? pipeline(body, decompress, fs.createWriteStream(tmp))
    : pipeline(body, fs.createWriteStream(tmp)));
  fs.renameSync(tmp, dest);
  return dest;
}

/** Parse one demo file into per-player match metrics + grenade landings. */
function digest(file, band) {
  const parsed = parseDemo(file);
  const byPlayer = new Map();
  for (const row of parsed.rows) {
    if (!byPlayer.has(row.steamid)) byPlayer.set(row.steamid, []);
    byPlayer.get(row.steamid).push(row);
  }
  const perPlayer = [];
  for (const [steamid, rows] of byPlayer) {
    // A handful of rounds is noise, not a performance.
    if (rows.length < 8) continue;
    const metrics = metricsOfRows(rows);
    if (metrics) perPlayer.push({ steamid, band, metrics });
  }
  return { perPlayer, grenades: parsed.grenades, map: parsed.map, rounds: parsed.rounds };
}

async function main() {
  const key = process.env.FACEIT_API_KEY;
  const localDir = arg("local");

  const perPlayer = [];
  const grenades = [];

  if (localDir && localDir !== true) {
    // ---- offline mode: parse demos already on disk ----
    const files = fs.readdirSync(localDir).filter((f) => f.endsWith(".dem"));
    if (files.length === 0) return warn(`no .dem files in ${localDir}`);
    log(`parsing ${files.length} local demos`);
    for (const f of files) {
      try {
        const d = digest(path.join(localDir, f), arg("band", "unknown"));
        perPlayer.push(...d.perPlayer);
        grenades.push(...d.grenades);
        log(`  ${f}: ${d.map}, ${d.rounds} rounds, ${d.perPlayer.length} players`);
      } catch (e) {
        warn(`  ${f}: ${e.message}`);
      }
    }
  } else {
    // ---- FACEIT mode ----
    if (!key) {
      console.error(
        "FACEIT_API_KEY is not set.\n" +
        "Create a *server-side* key at https://developers.faceit.com and put it in .env,\n" +
        "or run offline against demos you already have:\n" +
        "  node scripts/demo-ingest/ingest.mjs --local ./demos --band 7-8",
      );
      process.exit(1);
    }

    const nickname = arg("player");
    const wanted = Number(arg("matches", 20));
    if (!nickname || nickname === true) {
      console.error("Pass --player <faceit nickname>, or --local <dir>.");
      process.exit(1);
    }

    const player = await playerByNickname(String(nickname), key);
    if (!player?.player_id) return warn(`no FACEIT player called ${nickname}`);
    log(`${player.nickname} — elo ${player?.games?.cs2?.faceit_elo ?? "?"}`);

    const history = await matchHistory(player.player_id, key, { limit: wanted });
    log(`${history.length} recent matches`);

    for (const h of history) {
      try {
        const match = await matchDetails(h.match_id, key);
        const urls = demoUrls(match);
        if (urls.length === 0) {
          warn(`  ${h.match_id}: no demo published yet`);
          continue;
        }
        const elo = await matchAverageElo(match, key);
        const band = bandOf(elo);
        const file = await fetchDemo(urls[0], h.match_id);
        const d = digest(file, band);
        perPlayer.push(...d.perPlayer);
        grenades.push(...d.grenades);
        log(`  ${h.match_id}: ${d.map}, band ${band}, ${d.perPlayer.length} players`);
      } catch (e) {
        warn(`  ${h.match_id}: ${describe(e)}`);
      }
    }
  }

  if (perPlayer.length === 0) return warn("nothing parsed — no benchmark written");

  // Merge with anything previously ingested so the corpus grows across runs.
  const benchFile = path.join(OUT, "faceit.json");
  const priorSamples = fs.existsSync(benchFile)
    ? JSON.parse(fs.readFileSync(benchFile, "utf8"))?.rawSamples ?? []
    : [];
  const allSamples = [...priorSamples, ...perPlayer.map((p) => ({ band: p.band, metrics: p.metrics }))];

  const bench = buildBenchmark(allSamples, { minSamples: Number(arg("min-samples", 20)) });
  // Keep the raw per-player metrics so later runs can rebuild ladders without
  // re-parsing every demo. Small: ~20 numbers per player-match.
  bench.rawSamples = allSamples;
  writeJson(benchFile, bench);

  const nadeFile = path.join(OUT, "nades.json");
  const priorNades = fs.existsSync(nadeFile)
    ? JSON.parse(fs.readFileSync(nadeFile, "utf8"))?.clusters ?? []
    : [];
  // Re-expand prior clusters by count so merging stays weighted correctly.
  const expanded = priorNades.flatMap((c) => Array.from({ length: c.count }, () => c));
  writeJson(nadeFile, buildNadeClusters([...expanded, ...grenades]));

  console.log(
    `\nwrote ${benchFile}\n` +
    `  bands: ${Object.entries(bench.bands).map(([b, v]) => `${b}(${v.samples})`).join(", ") || "none yet"}\n` +
    `wrote ${nadeFile}\n` +
    `  ${JSON.parse(fs.readFileSync(nadeFile, "utf8")).clusters.length} landing clusters`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
