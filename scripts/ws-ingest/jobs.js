// Background ingest jobs.
//
// Pasting a Workshop link on the website kicks off work that takes minutes
// (steamcmd self-updates, downloads tens of megabytes, and may sit waiting for
// a Steam Guard confirmation), which is far too long to hold an HTTP request
// open. So the route enqueues a job and returns immediately; this module runs
// it and records progress to disk, and the page polls.
//
// Job states:
//   queued        accepted, not started
//   running       a step is in progress
//   guard_pending steamcmd is waiting for the mobile-app confirmation — this is
//                 what raises the "pending Steam verification" banner
//   done          finished; `skin` holds the final record
//   failed        `error` says why
//
// Jobs live on disk so a server restart doesn't lose them, and so the banner
// survives a page reload.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { fetchDetails, assertCs2, downloadPreview, parseWorkshopId } = require("./workshop");
const { resolveWeapon } = require("./weapons");
const { readVpkFile, findByExtension } = require("./vpk");
const { locateVpk, resolveSteamCmd } = require("./steamcmd");
const { buildRecord, writeRecord, rebuildIndex } = require("./manifest");
const { syncAddonsToServer } = require("./serverSync");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data", "workshop");
const JOB_DIR = path.join(DATA_DIR, "jobs");
const ASSET_DIR = path.join(REPO_ROOT, "public", "web_assets");

const STEPS = ["metadata", "preview", "download", "materials", "deploy"];

// Only one steamcmd at a time — concurrent runs fight over the same session
// cache and content directory.
let active = null;
const queue = [];

function ensureDirs() {
  fs.mkdirSync(JOB_DIR, { recursive: true });
}

function jobFile(id) {
  return path.join(JOB_DIR, `${id}.json`);
}

function saveJob(job) {
  ensureDirs();
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(jobFile(job.id), `${JSON.stringify(job, null, 2)}\n`);
  return job;
}

function readJob(id) {
  try {
    return JSON.parse(fs.readFileSync(jobFile(id), "utf8"));
  } catch {
    return null;
  }
}

function listJobs({ limit = 25 } = {}) {
  ensureDirs();
  const jobs = [];
  for (const name of fs.readdirSync(JOB_DIR)) {
    if (!name.endsWith(".json")) continue;
    const job = readJob(name.replace(/\.json$/, ""));
    if (job) jobs.push(job);
  }
  jobs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return jobs.slice(0, limit);
}

/** Jobs a page should still be watching. */
function activeJobs() {
  return listJobs({ limit: 50 }).filter((j) => j.status === "queued" || j.status === "running" || j.status === "guard_pending");
}

function setStep(job, step, note) {
  job.step = step;
  job.stepIndex = STEPS.indexOf(step);
  if (note) job.note = note;
  saveJob(job);
}

/**
 * Run steamcmd for one item, watching its output for the Steam Guard prompt.
 *
 * Uses the *cached session*: `+login <user>` with no password. steamcmd stores
 * the session after one interactive sign-in, so no Steam password is ever kept
 * by this app. If the cache is missing or expired, steamcmd asks for a mobile
 * confirmation and we surface that as `guard_pending`.
 */
function runSteamcmd(job, workshopId, { steamcmd, login, timeoutMs = 900000 }) {
  return new Promise((resolve) => {
    const bin = resolveSteamCmd(steamcmd);
    if (!bin) return resolve({ ok: false, error: "steamcmd not found on this machine" });
    if (!login) return resolve({ ok: false, error: "no STEAM_LOGIN configured" });

    const args = ["+login", login, "+workshop_download_item", "730", String(workshopId), "+quit"];
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });

    let output = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `steamcmd timed out after ${Math.round(timeoutMs / 1000)}s`, output }),
      timeoutMs
    );

    const onData = (chunk) => {
      const text = chunk.toString();
      output += text;

      // The banner trigger. steamcmd prints this while it blocks on the phone.
      if (/confirm the login in the Steam Mobile app|Steam Guard mobile authenticator/i.test(text)
        && job.status !== "guard_pending") {
        job.status = "guard_pending";
        job.note = "Waiting for the Steam Mobile app confirmation";
        saveJob(job);
      }

      // Confirmation came through — back to normal running.
      if (/Waiting for user info.*OK|Logged in OK|Downloading item/i.test(text) && job.status === "guard_pending") {
        job.status = "running";
        job.note = "Downloading the workshop item";
        saveJob(job);
      }

      if (/Success\. Downloaded item/i.test(output)) {
        const dir = /Success\. Downloaded item \d+ to "([^"]+)"/i.exec(output);
        finish({ ok: true, output, contentDir: dir ? dir[1] : null });
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => finish({ ok: false, error: `could not run steamcmd: ${err.message}`, output }));
    child.on("close", () => {
      const failure = /ERROR! Download item .*? failed \((.+?)\)/i.exec(output);
      if (failure) {
        const reason = failure[1];
        // Name the binary we actually resolved: the path differs per host
        // (~/steamcmd/steamcmd.sh locally, /usr/games/steamcmd on the server),
        // and telling someone to run a path that doesn't exist wastes their time.
        const friendly = /access denied/i.test(reason)
          ? "Steam denied the download. The cached session is missing or expired — "
            + `run \`${bin} +login ${login}\` once on this machine and approve it on your phone.`
          : `steamcmd could not download the item: ${reason}`;
        return finish({ ok: false, error: friendly, output });
      }
      if (/Wait for confirmation timed out|Timed out waiting for confirmation/i.test(output)) {
        return finish({
          ok: false,
          error: "Steam Guard confirmation timed out — the login was never approved on the phone.",
          output,
        });
      }
      finish({ ok: false, error: "steamcmd finished without reporting a successful download", output });
    });
  });
}

/** The whole pipeline for one job. */
async function runJob(job) {
  const config = {
    steamcmd: process.env.STEAMCMD_PATH || null,
    login: process.env.STEAM_LOGIN || null,
    deploy: process.env.GAMESERVER_FTP_HOST ? true : false,
  };

  job.status = "running";
  saveJob(job);

  try {
    // ---- 1. metadata ----
    setStep(job, "metadata", "Fetching workshop details");
    const details = await fetchDetails(job.workshopId);
    assertCs2(details);
    job.name = details.title;
    saveJob(job);

    const weapon = await resolveWeapon(details);

    // ---- 2. preview ----
    setStep(job, "preview", "Downloading the preview image");
    let preview = null;
    try {
      preview = await downloadPreview(details.previewUrl, ASSET_DIR, job.workshopId, { format: "original" });
    } catch {
      // Survivable: the record is still worth having without an image.
    }

    // Keep anything a previous run found.
    const existing = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${job.workshopId}.json`), "utf8")); }
      catch { return null; }
    })();

    // Write an early record so the skin shows on the site while the rest runs.
    let record = buildRecord({
      details, weapon, preview,
      vpk: existing?.vpk ?? null,
      materials: existing?.materials ?? [],
      webPath: preview ? `/web_assets/${path.basename(preview.file)}` : existing?.preview?.webPath ?? null,
    });
    record.deployedAt = existing?.deployedAt ?? null;
    writeRecord(DATA_DIR, record);
    rebuildIndex(DATA_DIR);

    // ---- 3. download ----
    setStep(job, "download", "Downloading the workshop files");
    const dl = await runSteamcmd(job, job.workshopId, config);

    let materials = record.materials;
    let vpkInfo = record.vpk;

    if (dl.ok) {
      // ---- 4. materials ----
      job.status = "running";
      setStep(job, "materials", "Reading the VPK");
      const located = locateVpk(job.workshopId, { reportedDir: dl.contentDir, steamcmd: config.steamcmd });
      if (located.vpk) {
        const { version, entries } = readVpkFile(located.vpk);
        materials = findByExtension(entries, [".vmat_c"]).map((e) => e.path).sort();
        vpkInfo = {
          file: located.vpk,
          bytes: fs.statSync(located.vpk).size,
          version,
          entryCount: entries.length,
        };
      } else {
        job.warnings = [...(job.warnings || []), "downloaded, but no .vpk was found"];
      }
    } else {
      job.warnings = [...(job.warnings || []), dl.error];
      saveJob(job);
    }

    record = buildRecord({
      details, weapon, preview,
      vpk: vpkInfo,
      materials,
      webPath: preview ? `/web_assets/${path.basename(preview.file)}` : record.preview?.webPath ?? null,
    });
    record.deployedAt = existing?.deployedAt ?? null;
    writeRecord(DATA_DIR, record);
    rebuildIndex(DATA_DIR);

    // ---- 5. deploy ----
    setStep(job, "deploy", "Adding the addon to the game server");
    if (config.deploy) {
      try {
        const result = await syncAddonsToServer();
        record.deployedAt = new Date().toISOString();
        writeRecord(DATA_DIR, record);
        rebuildIndex(DATA_DIR);
        job.deploy = result;
      } catch (err) {
        job.warnings = [...(job.warnings || []), `server sync failed: ${err.message}`];
      }
    } else {
      job.warnings = [...(job.warnings || []), "no game-server FTP configured — skin added to the site only"];
    }

    job.status = "done";
    job.step = "done";
    job.stepIndex = STEPS.length;
    const mats = materials.length
      ? `${materials.length} material path(s)`
      : "materials still missing";
    // Say whether it reached the game server: that's the part people are
    // waiting on, and it used to be a manual step they had to remember.
    job.note = job.deploy
      ? `Added ${record.name} (${mats}) — ${job.deploy.note}`
      : `Added ${record.name} (${mats})`;
    job.skin = record;
    saveJob(job);
  } catch (err) {
    job.status = "failed";
    job.error = err.message;
    saveJob(job);
  }
}

function pump() {
  if (active || !queue.length) return;
  active = queue.shift();
  runJob(active).finally(() => {
    active = null;
    pump();
  });
}

/** Queue an ingest. Returns the job immediately. */
function enqueue(input) {
  const workshopId = parseWorkshopId(input);
  if (!workshopId) throw new Error("That doesn't look like a Workshop link or id.");

  // Don't stack duplicate work for the same item.
  const running = [...(active ? [active] : []), ...queue].find((j) => j.workshopId === workshopId);
  if (running) return running;

  const job = saveJob({
    id: `${workshopId}-${Date.now().toString(36)}`,
    workshopId,
    name: null,
    status: "queued",
    step: "metadata",
    stepIndex: 0,
    steps: STEPS,
    note: "Queued",
    warnings: [],
    createdAt: new Date().toISOString(),
  });

  queue.push(job);
  pump();
  return job;
}

module.exports = { enqueue, readJob, listJobs, activeJobs, STEPS };
