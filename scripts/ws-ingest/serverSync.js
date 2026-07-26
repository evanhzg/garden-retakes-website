// Push ingested workshop ids to the game server.
//
// This used to spawn `Garden-retakes/deploy/deploy.mjs --addons-only`, which
// only works on a machine that has the Garden-retakes repo checked out next to
// this one. The web server doesn't, so the deploy step failed there every time
// and the site fell back to telling people to deploy by hand.
//
// The addon half of that script is small — read the MultiAddonManager config
// over FTP, union the ids into mm_extra_addons, upload it — so it lives here
// now and the website can finish the job on its own. Credentials come from
// GAMESERVER_FTP_* / GAMESERVER_MAM_CFG, which the deploy script already used.

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { rebuildIndex } = require("./manifest");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data", "workshop");

function config() {
  return {
    host: process.env.GAMESERVER_FTP_HOST || "",
    port: Number(process.env.GAMESERVER_FTP_PORT || 21),
    user: process.env.GAMESERVER_FTP_USER || "",
    password: process.env.GAMESERVER_FTP_PASSWORD || "",
    secure: /^(1|true|yes)$/i.test(process.env.GAMESERVER_FTP_SECURE || ""),
    mamCfg: process.env.GAMESERVER_MAM_CFG || "/cfg/multiaddonmanager/multiaddonmanager.cfg",
  };
}

/** Every ingested workshop record, oldest first so addon order stays stable. */
function readWorkshopIds() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const records = [];
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (!/^\d+\.json$/.test(name)) continue;
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8")));
    } catch {
      // A half-written record shouldn't stop a deploy.
    }
  }
  records.sort((a, b) => (a.ingestedAt || "").localeCompare(b.ingestedAt || ""));
  return records;
}

/**
 * Set a convar, matching the config's existing column alignment.
 * Appends the line when the convar isn't in the file yet.
 */
function setConVar(text, name, value) {
  const line = `${name.padEnd(31)}"${value}"`;
  const re = new RegExp(`^\\s*${name}\\s+"[^"]*".*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.replace(/\s*$/, "")}\n${line}\n`;
}

async function downloadToBuffer(client, remotePath) {
  const tmp = path.join(os.tmpdir(), `garden-sync-${Date.now()}-${path.basename(remotePath)}`);
  try {
    await client.downloadTo(tmp, remotePath);
    const buf = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    return buf;
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
    return null;
  }
}

/** Stamp the records we just published so the UI can show "on server". */
function markDeployed(ids) {
  const at = new Date().toISOString();
  for (const id of ids) {
    const file = path.join(DATA_DIR, `${id}.json`);
    try {
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      record.deployedAt = at;
      fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
    } catch {
      // Not fatal: the addon is live either way, only the badge goes stale.
    }
  }
  try { rebuildIndex(DATA_DIR); } catch { /* index is derived, not critical */ }
}

/**
 * Ask the server to load the new addons immediately.
 *
 * Without this, clients only pick them up on the next map change. Optional —
 * RCON often isn't configured, and a missed reload is not a failed deploy.
 * Minimal Source RCON, same protocol as lib/rcon.ts, which can't be imported
 * here: that's TypeScript inside the Next build graph, this is standalone CJS.
 */
function rconReload(command = "mm_reload_addons") {
  const host = process.env.RCON_HOST;
  const port = Number.parseInt(process.env.RCON_PORT || "27015", 10);
  const password = process.env.RCON_PASSWORD;
  if (!host || !password) return Promise.resolve({ ran: false, reason: "RCON not configured" });

  const packet = (id, type, body) => {
    const bodyBuf = Buffer.from(body, "utf8");
    const buf = Buffer.alloc(14 + bodyBuf.length);
    buf.writeInt32LE(10 + bodyBuf.length, 0);
    buf.writeInt32LE(id, 4);
    buf.writeInt32LE(type, 8);
    bodyBuf.copy(buf, 12);
    return buf;
  };

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 6000 });
    let authed = false;
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.on("timeout", () => done({ ran: false, reason: "RCON timeout" }));
    socket.on("error", (e) => done({ ran: false, reason: e.message }));
    socket.on("connect", () => socket.write(packet(1, 3, password)));
    socket.on("data", (chunk) => {
      if (authed) return;
      // The auth response carries id -1 when the password was rejected.
      if (chunk.length >= 8 && chunk.readInt32LE(4) === -1) {
        return done({ ran: false, reason: "RCON auth failed" });
      }
      authed = true;
      socket.write(packet(2, 2, command));
      setTimeout(() => done({ ran: true, command }), 1200);
    });
  });
}

/**
 * Union the ingested ids into the server's mm_extra_addons and upload.
 *
 * Never removes an id: somebody may have added one on the server by hand, and
 * a website deploy has no business dropping it.
 */
async function syncAddonsToServer() {
  const cfg = config();
  if (!cfg.host) throw new Error("No game server configured (GAMESERVER_FTP_HOST).");

  const records = readWorkshopIds();
  const ids = records.map((r) => String(r.workshopId));
  if (!ids.length) return { changed: false, ids: [], added: [], note: "no ingested skins to publish" };

  // Required lazily so a deployment without basic-ftp still serves the site.
  const { Client } = require("basic-ftp");
  const client = new Client(30000);

  try {
    await client.access({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      secure: cfg.secure,
    });

    const current = await downloadToBuffer(client, cfg.mamCfg);
    if (!current) {
      throw new Error(
        `${cfg.mamCfg} not found on the game server — install MultiAddonManager first `
        + "(deploy.mjs --mam) so there is a config to update."
      );
    }

    const before = current.toString("utf8");
    const existing = (/^\s*mm_extra_addons\s+"([^"]*)"/m.exec(before)?.[1] || "")
      .split(",").map((s) => s.trim()).filter(Boolean);

    const merged = [...new Set([...existing, ...ids])];
    const added = merged.filter((id) => !existing.includes(id));

    if (!added.length) {
      markDeployed(ids);
      return { changed: false, ids, added: [], total: merged.length, note: `already listed (${merged.length} addon(s))` };
    }

    const tmp = path.join(os.tmpdir(), `multiaddonmanager-${Date.now()}.cfg`);
    fs.writeFileSync(tmp, setConVar(before, "mm_extra_addons", merged.join(",")));
    try {
      await client.uploadFrom(tmp, cfg.mamCfg);
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    }

    markDeployed(ids);
    const reload = await rconReload();
    return {
      changed: true,
      ids,
      added,
      total: merged.length,
      reload,
      note: reload.ran
        ? `added ${added.length} addon(s); asked the server to reload them`
        : `added ${added.length} addon(s); clients pick them up on the next map change`,
    };
  } finally {
    client.close();
  }
}

module.exports = { syncAddonsToServer, setConVar, readWorkshopIds };
