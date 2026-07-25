#!/usr/bin/env node
// ws-ingest — pull a CS2 Workshop skin into something both halves of Garden
// can use: a preview image for the web inventory, and the compiled material
// path(s) the !ws plugin needs.
//
//   node scripts/ws-ingest 3771230656
//
// The four stages are independent, so any of them can be skipped:
//   1. Steam Web API      → title, description, tags, preview_url
//   2. preview image      → public/web_assets/<id>.png
//   3. steamcmd           → the workshop VPK   (--vpk / --skip-download)
//   4. VPK directory read → materials/**/*.vmat_c
//
// Run with --help for the full flag list.

const fs = require("node:fs");
const path = require("node:path");

const { fetchDetails, assertCs2, downloadPreview, parseWorkshopId, WorkshopError } = require("./workshop");
const { downloadItem, locateVpk, resolveSteamCmd, SteamCmdError } = require("./steamcmd");
const { readVpkFile, findByExtension, VpkError } = require("./vpk");
const { resolveWeapon, looksLikeWeaponFinish } = require("./weapons");
const { buildRecord, writeRecord, rebuildIndex, writeSql } = require("./manifest");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULTS = {
  // Under public/ so Next serves it straight at /web_assets/<id>.png.
  outDir: path.join(REPO_ROOT, "public", "web_assets"),
  dataDir: path.join(REPO_ROOT, "data", "workshop"),
  imageFormat: "png",
};

// ---------------------------------------------------------------- pretty out
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const bold = (s) => paint("1", s);
const dim = (s) => paint("2", s);
const green = (s) => paint("32", s);
const yellow = (s) => paint("33", s);
const red = (s) => paint("31", s);

const step = (n, label) => console.log(`\n${bold(`[${n}/4]`)} ${bold(label)}`);
const ok = (msg) => console.log(`  ${green("✓")} ${msg}`);
const info = (msg) => console.log(`  ${dim("·")} ${dim(msg)}`);
const warn = (msg) => console.log(`  ${yellow("!")} ${yellow(msg)}`);

function usage() {
  console.log(`${bold("ws-ingest")} — CS2 Workshop skin ingest pipeline

${bold("Usage")}
  node scripts/ws-ingest <workshopId|workshopUrl> [options]

${bold("Options")}
  --vpk <file>          Use a local .vpk instead of running steamcmd
  --skip-download       Metadata + preview only; don't touch steamcmd
  --skip-image          Don't download the preview image
  --steamcmd <path>     Path to steamcmd (default: \$STEAMCMD, PATH, ~/steamcmd)
  --steam-login <user>  Steam account for the download. REQUIRED for CS2 —
                        Valve denies app 730 workshop items to anonymous
                        sessions. Any account that owns CS2 works (it's free);
                        steamcmd asks for the password + Steam Guard code once.
  --steam-dir <path>    Where steamcmd stores steamapps/ (if non-standard)
  --out-dir <path>      Preview image directory
                        (default: public/web_assets)
  --data-dir <path>     JSON output directory
                        (default: data/workshop)
  --image-format <fmt>  png | original          (default: png)
  --sql                 Also emit a mock SQL insert next to the JSON
  --json                Print the record to stdout as JSON
  --quiet               Only print errors and the final summary
  -h, --help            This message

${bold("Notes")}
  Steam serves previews as JPEG. --image-format png re-encodes them, which
  needs 'sharp' or 'jpeg-js'+'pngjs' installed; without either the original
  JPEG is kept and you'll be told. --image-format original skips all that and
  is smaller.
`);
}

function parseArgs(argv) {
  const opts = {
    workshopId: null,
    vpk: null,
    skipDownload: false,
    skipImage: false,
    steamcmd: null,
    steamLogin: null,
    steamDir: null,
    outDir: DEFAULTS.outDir,
    dataDir: DEFAULTS.dataDir,
    imageFormat: DEFAULTS.imageFormat,
    sql: false,
    json: false,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };

    switch (arg) {
      case "-h": case "--help": opts.help = true; break;
      case "--vpk": opts.vpk = next(); break;
      case "--skip-download": opts.skipDownload = true; break;
      case "--skip-image": opts.skipImage = true; break;
      case "--steamcmd": opts.steamcmd = next(); break;
      case "--steam-login": opts.steamLogin = next(); break;
      case "--steam-dir": opts.steamDir = next(); break;
      case "--out-dir": opts.outDir = path.resolve(next()); break;
      case "--data-dir": opts.dataDir = path.resolve(next()); break;
      case "--image-format": opts.imageFormat = next(); break;
      case "--sql": opts.sql = true; break;
      case "--json": opts.json = true; break;
      case "--quiet": opts.quiet = true; break;
      default:
        if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
        if (opts.workshopId) throw new Error("only one workshop id at a time");
        opts.workshopId = arg;
    }
  }

  if (!["png", "original"].includes(opts.imageFormat)) {
    throw new Error(`--image-format must be png or original, got "${opts.imageFormat}"`);
  }
  return opts;
}

/** `public/web_assets/x.png` → `/web_assets/x.png`, when it's under public/. */
function toWebPath(file) {
  const publicDir = path.join(REPO_ROOT, "public");
  const rel = path.relative(publicDir, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `/${rel.split(path.sep).join("/")}`;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${red("✗")} ${err.message}\n`);
    usage();
    process.exit(2);
  }

  if (opts.help || !opts.workshopId) {
    usage();
    process.exit(opts.help ? 0 : 2);
  }

  // A pasted Workshop link works just as well as a bare id.
  const parsedId = parseWorkshopId(opts.workshopId);
  if (!parsedId) {
    console.error(`${red("✗")} "${opts.workshopId}" is not a Workshop id or link`);
    process.exit(2);
  }
  opts.workshopId = parsedId;

  const quiet = opts.quiet;
  const say = { step: quiet ? () => {} : step, ok: quiet ? () => {} : ok, info: quiet ? () => {} : info, warn };

  if (!quiet) console.log(bold(`\nws-ingest ${opts.workshopId}`));

  // ---------------------------------------------------------------- 1. meta
  say.step(1, "Workshop metadata");
  const details = await fetchDetails(opts.workshopId);
  assertCs2(details);
  say.ok(`${bold(details.title || "(untitled)")}`);
  if (details.tags.length) say.info(`tags: ${details.tags.join(", ")}`);
  if (!looksLikeWeaponFinish(details.tags)) {
    say.warn("no 'Weapon Finish' tag — this may not be a weapon skin");
  }

  const weapon = await resolveWeapon(details);
  if (weapon) say.ok(`weapon: ${weapon.name} (def ${weapon.def}) ${dim(`via ${weapon.via}`)}`);
  else say.warn("could not work out which weapon this is — 'def' will be null");

  // --------------------------------------------------------------- 2. image
  say.step(2, "Preview image");
  let preview = null;
  if (opts.skipImage) {
    say.info("skipped (--skip-image)");
  } else {
    preview = await downloadPreview(details.previewUrl, opts.outDir, opts.workshopId, {
      format: opts.imageFormat,
    });
    say.ok(`${path.relative(REPO_ROOT, preview.file)} ${dim(`(${(preview.bytes / 1024).toFixed(0)} KB)`)}`);
    if (preview.note) say.warn(preview.note);
    else if (preview.sourceExt !== preview.ext) {
      say.info(`converted ${preview.sourceExt} → ${preview.ext} (${(preview.originalBytes / 1024).toFixed(0)} KB → ${(preview.bytes / 1024).toFixed(0)} KB)`);
    }
  }

  // ----------------------------------------------------------------- 3. vpk
  say.step(3, "Workshop VPK");
  let vpkFile = null;

  if (opts.vpk) {
    vpkFile = path.resolve(opts.vpk);
    if (!fs.existsSync(vpkFile)) throw new Error(`--vpk file not found: ${vpkFile}`);
    say.ok(`using local file ${path.relative(process.cwd(), vpkFile)}`);
  } else if (opts.skipDownload) {
    say.info("skipped (--skip-download)");
  } else {
    const bin = resolveSteamCmd(opts.steamcmd);
    if (!bin) {
      say.warn("steamcmd not found — skipping the download");
      say.info("install it, or pass --steamcmd <path> / --vpk <file>");
    } else {
      say.info(`running ${bin}${opts.steamLogin ? ` as ${opts.steamLogin}` : " anonymously"} (this can take a few minutes on first use)`);
      // A download failure must not throw away the metadata and preview we
      // already have — those are the parts the website needs, and they're
      // often all you can get (see the CS2 anonymous-login note in steamcmd.js).
      try {
        const result = await downloadItem(opts.workshopId, {
          steamcmd: opts.steamcmd,
          login: opts.steamLogin,
          onLine: quiet ? undefined : (line) => {
            if (/Success|ERROR|Update state|Downloading/i.test(line)) info(line);
          },
        });
        const located = locateVpk(opts.workshopId, {
          reportedDir: result.contentDir,
          steamcmd: opts.steamcmd,
          steamDir: opts.steamDir,
        });
        if (!located.vpk) {
          say.warn(`no .vpk found under ${located.searched?.join(", ") || "the content dir"}`);
        } else {
          vpkFile = located.vpk;
          say.ok(`${vpkFile}`);
          if (located.all.length > 1) say.info(`${located.all.length} vpk files present; read the directory one`);
        }
      } catch (err) {
        say.warn(err.message);
        say.info("continuing without the VPK — metadata and preview are still saved");
      }
    }
  }

  // ----------------------------------------------------------- 4. materials
  say.step(4, "Material paths");
  let materials = [];
  let vpkInfo = null;

  if (!vpkFile) {
    say.info("no VPK available — nothing to read");
  } else {
    const { version, entries } = readVpkFile(vpkFile);
    const mats = findByExtension(entries, [".vmat_c"]);
    materials = mats.map((m) => m.path).sort();
    vpkInfo = {
      file: vpkFile,
      bytes: fs.statSync(vpkFile).size,
      version,
      entryCount: entries.length,
    };
    say.ok(`${entries.length} entries in the VPK, ${materials.length} .vmat_c`);
    for (const m of materials.slice(0, 12)) console.log(`      ${m}`);
    if (materials.length > 12) say.info(`… and ${materials.length - 12} more`);
    if (!materials.length) say.warn("no .vmat_c files — is this really a skin VPK?");
  }

  // -------------------------------------------------------------- 5. export
  // Carry forward anything an earlier run discovered that this one couldn't:
  // re-running with --skip-download (or after a steamcmd failure) must not
  // erase material paths that were already found.
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(path.join(opts.dataDir, `${opts.workshopId}.json`), "utf8"));
  } catch { /* first time for this id */ }

  if (!materials.length && previous?.materials?.length) {
    materials = previous.materials;
    vpkInfo = vpkInfo ?? previous.vpk ?? null;
    say.info(`kept ${materials.length} material path(s) from the previous run`);
  }

  const record = buildRecord({
    details,
    weapon,
    preview,
    vpk: vpkInfo,
    materials,
    webPath: preview ? toWebPath(preview.file) : previous?.preview?.webPath ?? null,
  });
  // Deployment state belongs to the server sync, not to an ingest.
  record.deployedAt = previous?.deployedAt ?? null;

  const recordFile = writeRecord(opts.dataDir, record);
  const index = rebuildIndex(opts.dataDir);
  const sqlFile = opts.sql ? writeSql(opts.dataDir, record) : null;

  if (!quiet) {
    console.log(`\n${bold("Written")}`);
    ok(path.relative(REPO_ROOT, recordFile));
    ok(`${path.relative(REPO_ROOT, index.file)} ${dim(`(${index.count} skins)`)}`);
    if (sqlFile) ok(path.relative(REPO_ROOT, sqlFile));
    console.log();
  }

  if (opts.json) console.log(JSON.stringify(record, null, 2));
  return record;
}

main().catch((err) => {
  const known = err instanceof WorkshopError || err instanceof SteamCmdError || err instanceof VpkError;
  console.error(`\n${red("✗")} ${err.message}`);
  if (!known && err.stack) console.error(dim(err.stack.split("\n").slice(1, 4).join("\n")));
  process.exit(1);
});
