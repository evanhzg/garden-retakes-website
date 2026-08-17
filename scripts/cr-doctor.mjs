#!/usr/bin/env node
/**
 * Why did the Competitive Retakes match not start?
 *
 * The hand-off from the website to the game server runs inside the Socket.IO
 * process (server.js -> scripts/retakesMatchmaking.js), which in production is a
 * *different service* from the Next.js app — so "the website has RCON
 * configured" and "the thing that starts matches has RCON configured" are two
 * different facts, and only the second one matters here. Everything this checks
 * is checked from wherever you run it, which is why you should run it on the
 * host that runs server.js.
 *
 * It sends nothing that changes the server's state: status, and the plugin's own
 * read-only report commands.
 *
 *   node scripts/cr-doctor.mjs
 *   node scripts/cr-doctor.mjs --map de_mirage    # also check the map matches
 *
 * Exit code 0 if the hand-off should work, 1 if it found something that would
 * stop it.
 */

import net from "node:net";
import process from "node:process";

const args = process.argv.slice(2);
const wantMap = args.includes("--map") ? args[args.indexOf("--map") + 1] : null;
// css_cr_reset is the only command here that changes anything — it clears a
// half-declared match. Read-only by default so this is safe to run against a
// live server while people are on it.
const allowReset = args.includes("--reset");

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const note = (m) => console.log(`    \x1b[90m${m}\x1b[0m`);

let failed = false;
const fail = (m) => { failed = true; bad(m); };

/**
 * The same client scripts/retakesMatchmaking.js uses, kept deliberately
 * separate: if that file's copy is broken, a doctor that imports it is broken
 * in the same way and reports success.
 */
function rcon(command, { host, port, password, timeout = 8000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout });
    let buffer = Buffer.alloc(0);
    let authed = false;
    let response = "";
    const done = (err) => {
      socket.destroy();
      if (err) reject(err);
      else resolve(response.trim());
    };

    const packet = (id, type, body) => {
      const b = Buffer.from(body, "utf8");
      const p = Buffer.alloc(14 + b.length);
      p.writeInt32LE(10 + b.length, 0);
      p.writeInt32LE(id, 4);
      p.writeInt32LE(type, 8);
      b.copy(p, 12);
      return p;
    };

    socket.on("timeout", () => done(new Error("timed out")));
    socket.on("error", (e) => done(e));
    socket.on("connect", () => socket.write(packet(1, 3, password)));

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < 4 + size) break;
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.subarray(12, 4 + size - 2).toString("utf8");
        buffer = buffer.subarray(4 + size);

        if (!authed && type === 2) {
          if (id === -1) return done(new Error("auth failed — wrong RCON_PASSWORD"));
          authed = true;
          socket.write(packet(2, 2, command));
          socket.write(packet(3, 0, ""));
          continue;
        }
        if (authed && type === 0 && id === 3) return done();
        if (authed && type === 0) response += body;
      }
    });
  });
}

const mapOf = (status) =>
  /^\s*map\s*[:=]\s*(\S+)/im.exec(String(status ?? ""))?.[1]?.split("/").pop()?.trim() ?? null;

async function main() {
  console.log("\nCompetitive Retakes hand-off check\n");

  // ---- 1. configuration -------------------------------------------------
  console.log("Configuration");
  const host = process.env.RCON_HOST;
  const port = Number.parseInt(process.env.RCON_PORT ?? "27015", 10);
  const password = process.env.RCON_PASSWORD;

  if (!host) fail("RCON_HOST is not set in this process.");
  else ok(`RCON_HOST = ${host}`);
  if (!password) fail("RCON_PASSWORD is not set in this process.");
  else ok(`RCON_PASSWORD is set (${password.length} chars)`);
  ok(`RCON_PORT = ${port}`);

  if (!host || !password) {
    note("This is the whole answer: rconExec rejects before it opens a socket,");
    note("startServer fails at step \"map\", and the lobby shows rcon_unconfigured.");
    note("Set them on the service that runs server.js — in production that is the");
    note("Socket.IO service, which is not the same deployment as the Next.js app.");
    process.exit(1);
  }

  const cfg = { host, port, password };

  // ---- 2. reachability --------------------------------------------------
  console.log("\nServer");
  let status;
  try {
    status = await rcon("status", cfg);
    ok("RCON connected and authenticated");
  } catch (err) {
    fail(`RCON failed: ${err.message}`);
    note("A server mid-map-change refuses connections, which is normal and");
    note("transient. If this is steady, check the host, the port, and that the");
    note("server's rcon_password is set to the same value.");
    process.exit(1);
  }

  const live = mapOf(status);
  if (live) ok(`on ${live}`);
  else {
    fail("`status` did not contain a map line.");
    note("waitForMap parses this exact line, so it would poll until it gave up");
    note("and the lobby would show map_timeout. First 200 chars of the reply:");
    note(JSON.stringify(String(status).slice(0, 200)));
  }

  if (wantMap && live && live !== wantMap) {
    fail(`asked about ${wantMap} but the server is on ${live}`);
  }

  // Binary in the reply means a packet parser reading past its own packet —
  // the bug this script deliberately does not share with the caller.
  if (/[\x00-\x08\x0e-\x1f]/.test(String(status))) {
    fail("the reply contains control bytes — the RCON parser is over-reading packets");
  } else {
    ok("reply parsed cleanly (no packet bleed)");
  }

  // ---- 3. the plugin ----------------------------------------------------
  console.log("\nPlugin");
  const version = await rcon("css_gstatus", cfg).catch((e) => `!${e.message}`);
  if (String(version).startsWith("!")) {
    fail(`css_gstatus failed: ${version.slice(1)}`);
  } else if (/unknown command/i.test(version)) {
    fail("css_gstatus is unknown — the R5e plugin is not loaded on this server.");
    note("Nothing in the hand-off can work until it is. Check");
    note("addons/counterstrikesharp/logs/ for why it failed to load.");
  } else {
    ok(`plugin answered: ${String(version).replace(/\s+/g, " ").slice(0, 160)}`);
  }

  for (const cmd of ["css_cr_status", "css_cr_diag"]) {
    const reply = await rcon(cmd, cfg).catch((e) => `!${e.message}`);
    const text = String(reply).replace(/\s+/g, " ").trim();
    if (text.startsWith("!")) {
      fail(`${cmd} failed: ${text.slice(1)}`);
    } else if (/unknown command/i.test(text)) {
      fail(`${cmd} is unknown — this server is running a plugin build older than the CR protocol.`);
      note("Deploy the current plugin: cd deploy && node deploy.mjs");
    } else {
      ok(`${cmd}: ${text.slice(0, 200) || "(no output)"}`);
    }
  }

  // ---- 4. permission ----------------------------------------------------
  // Every css_cr_* command is gated at AdminLevel.Admin, and the console is
  // supposed to count as Owner. A refusal is the one failure that looks exactly
  // like success from the website's side: RCON works, the command runs, and the
  // answer is no. css_cr_status above shares that gate, so its reply already
  // answers the question without writing anything.
  console.log("\nPermission");
  if (!allowReset) {
    ok("css_cr_status was answered, so the console clears the Admin gate");
    note("(--reset also tries css_cr_reset, which clears a half-declared match)");
  } else {
    const reset = await rcon("css_cr_reset", cfg).catch((e) => `!${e.message}`);
    const resetText = String(reset).replace(/\s+/g, " ").trim();
    if (/not authorized|permission|no access/i.test(resetText)) {
      fail(`the console is being refused: ${resetText.slice(0, 160)}`);
      note("css_cr_* gates on AdminLevel.Admin and the console should resolve as");
      note("Owner. If it does not, every match start is refused silently.");
    } else {
      ok(`css_cr_reset accepted: ${resetText.slice(0, 160) || "(no output)"}`);
    }
  }

  console.log(
    failed
      ? "\n\x1b[31mSomething above would stop a match from starting.\x1b[0m\n"
      : "\n\x1b[32mThe hand-off should work from this host.\x1b[0m\n"
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
