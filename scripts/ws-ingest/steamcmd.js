// steamcmd driver: download a workshop item and find the VPK it produced.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CS2_APP_ID = 730;

class SteamCmdError extends Error {}

/** Where steamcmd usually lives, in preference order. */
function defaultCandidates() {
  return [
    process.env.STEAMCMD,
    "steamcmd",
    path.join(os.homedir(), "steamcmd", "steamcmd.sh"),
    "/usr/games/steamcmd",
    "/usr/bin/steamcmd",
    "C:/steamcmd/steamcmd.exe",
  ].filter(Boolean);
}

/** First candidate that exists on disk or resolves on PATH. */
function resolveSteamCmd(explicit) {
  const candidates = explicit ? [explicit] : defaultCandidates();
  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    // A bare name: let the OS resolve it, but confirm it's really there.
    const dirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of dirs) {
      const full = path.join(dir, candidate);
      if (fs.existsSync(full)) return full;
      if (fs.existsSync(`${full}.exe`)) return `${full}.exe`;
    }
  }
  return null;
}

/**
 * Run `steamcmd +login <account> +workshop_download_item 730 <id> +quit`.
 *
 * Anonymous login does **not** work for CS2. Valve answers app 730 UGC requests
 * from an anonymous session with "Access Denied" — you need an account that owns
 * the game (CS2 is free, so any logged-in account qualifies). Pass `login` to
 * use one; steamcmd caches the session after the first interactive sign-in, so
 * the password and Steam Guard code are only needed once.
 *
 * steamcmd is chatty and slow (it self-updates on first run), so its output is
 * streamed through `onLine` rather than buffered — except during an interactive
 * login, where the terminal has to be handed straight to steamcmd so it can
 * prompt.
 */
function downloadItem(workshopId, { steamcmd, appId = CS2_APP_ID, login, onLine, timeoutMs = 900000 } = {}) {
  const bin = resolveSteamCmd(steamcmd);
  if (!bin) {
    throw new SteamCmdError(
      "steamcmd not found. Install it, or pass --steamcmd <path>, or use --vpk <file> to skip the download."
    );
  }

  const account = login || "anonymous";
  const interactive = Boolean(login);
  const args = [
    "+login", account,
    "+workshop_download_item", String(appId), String(workshopId),
    "+quit",
  ];

  return new Promise((resolve, reject) => {
    // With a real account steamcmd may need to ask for a password or a Steam
    // Guard code, so it gets the real stdio; we lose the output capture and
    // fall back to checking the filesystem for the result.
    if (interactive) {
      const child = spawn(bin, args, { stdio: "inherit" });
      child.on("error", (err) => reject(new SteamCmdError(`could not run ${bin}: ${err.message}`)));
      child.on("close", () => resolve({ bin, output: "", contentDir: null, interactive: true }));
      return;
    }

    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new SteamCmdError(`steamcmd timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const consume = (chunk) => {
      const text = chunk.toString();
      output += text;
      if (onLine) for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line.trimEnd());
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new SteamCmdError(`could not run ${bin}: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // steamcmd's exit code is unreliable, so trust its own success line.
      const success = /Success\. Downloaded item/i.test(output);
      if (!success) {
        const reason = /ERROR! Download item .*? failed \((.+?)\)/i.exec(output);
        // The one everybody hits first: CS2 UGC is not served anonymously.
        if (reason && /access denied/i.test(reason[1]) && Number(appId) === CS2_APP_ID) {
          reject(new SteamCmdError(
            "Steam refused the download (Access Denied). CS2 workshop items cannot be "
            + "fetched anonymously — rerun with --steam-login <your-steam-username> "
            + "(any account that owns CS2; it's free). steamcmd will ask for the password "
            + "and Steam Guard code once, then remember the session."
          ));
          return;
        }
        reject(new SteamCmdError(
          reason
            ? `steamcmd could not download ${workshopId}: ${reason[1]}`
            : `steamcmd finished with code ${code} but never reported a successful download`
        ));
        return;
      }

      // It prints the exact folder it wrote to — much more reliable than guessing.
      const dir = /Success\. Downloaded item \d+ to "([^"]+)"/i.exec(output);
      resolve({ bin, output, contentDir: dir ? dir[1] : null });
    });
  });
}

/** Directories steamcmd may have written the item to. */
function contentDirCandidates(workshopId, { steamcmd, steamDir, appId = CS2_APP_ID } = {}) {
  const bin = resolveSteamCmd(steamcmd);
  const roots = [
    steamDir,
    bin ? path.dirname(bin) : null,
    path.join(os.homedir(), "steamcmd"),
    path.join(os.homedir(), "Steam"),
    "/usr/games",
  ].filter(Boolean);

  return roots.map((root) =>
    path.join(root, "steamapps", "workshop", "content", String(appId), String(workshopId))
  );
}

/** Every `.vpk` under `dir`, recursively. */
function findVpks(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".vpk")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * Pick the VPK holding the directory tree.
 *
 * A multi-part set is `pak01_dir.vpk` + `pak01_000.vpk`, `pak01_001.vpk`… Only
 * the `_dir` one has the tree; the numbered parts are payload. A single-file
 * VPK (what most skins ship) has neither suffix.
 */
function pickDirectoryVpk(files) {
  if (!files.length) return null;
  const dir = files.find((f) => /_dir\.vpk$/i.test(f));
  if (dir) return dir;
  const notNumbered = files.filter((f) => !/_\d{3}\.vpk$/i.test(f));
  const pool = notNumbered.length ? notNumbered : files;
  // Largest first: for a skin the tree lives in the one real archive.
  return pool.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

/** Locate the downloaded VPK, preferring the path steamcmd itself reported. */
function locateVpk(workshopId, { reportedDir, steamcmd, steamDir, appId = CS2_APP_ID } = {}) {
  const dirs = [reportedDir, ...contentDirCandidates(workshopId, { steamcmd, steamDir, appId })]
    .filter(Boolean);

  for (const dir of dirs) {
    const vpks = findVpks(dir);
    const chosen = pickDirectoryVpk(vpks);
    if (chosen) return { vpk: chosen, contentDir: dir, all: vpks };
  }
  return { vpk: null, contentDir: null, all: [], searched: dirs };
}

module.exports = {
  resolveSteamCmd,
  downloadItem,
  locateVpk,
  findVpks,
  pickDirectoryVpk,
  contentDirCandidates,
  SteamCmdError,
  CS2_APP_ID,
};
