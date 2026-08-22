#!/usr/bin/env node
/**
 * Apply a file from sql/ to the database in DATABASE_URL.
 *
 *   node tools/apply-sql.mjs sql/competitive-loadout.sql
 *   node tools/apply-sql.mjs sql/competitive-loadout.sql --dry-run
 *
 * This repository does not use Prisma Migrate — there is no prisma/migrations,
 * schema.prisma describes a database that already exists, and changes are
 * hand-written into sql/. That worked while somebody had the `mysql` client to
 * hand; it is not installed here, and `prisma migrate` against a production
 * DATABASE_URL is the wrong tool for a different reason.
 *
 * So: statements out of the file, one at a time, through the driver the app
 * already depends on. Every file in sql/ is written to be idempotent, which is
 * what makes running one twice a non-event rather than a decision.
 *
 * `multipleStatements` is deliberately off. Splitting here means one statement
 * per round trip and a line number when one of them fails, instead of the
 * server rejecting a blob and naming an offset into it.
 */

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!file) {
  console.error("usage: node tools/apply-sql.mjs <file.sql> [--dry-run]");
  process.exit(2);
}

/** DATABASE_URL, from the environment or the .env beside this repo. */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".env");
  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is not set and not in .env");
  return line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

/**
 * Split a file into statements.
 *
 * Semicolons inside strings and comments are not statement ends, and this file
 * format has plenty of both — every guard here embeds an ALTER as a quoted
 * string. So it tracks quoting rather than splitting on the character.
 */
function statements(sql) {
  const out = [];
  let buf = "";
  let quote = null;
  let comment = null;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    if (comment) {
      if (comment === "line" && c === "\n") comment = null;
      else if (comment === "block" && c === "*" && next === "/") {
        comment = null;
        i++;
        continue;
      }
      if (comment === "line") buf += c === "\n" ? "\n" : "";
      continue;
    }

    if (!quote) {
      if (c === "-" && next === "-") { comment = "line"; i++; continue; }
      if (c === "#") { comment = "line"; continue; }
      if (c === "/" && next === "*") { comment = "block"; i++; continue; }
      if (c === "'" || c === '"' || c === "`") quote = c;
      else if (c === ";") {
        if (buf.trim()) out.push(buf.trim());
        buf = "";
        continue;
      }
    } else if (c === quote && sql[i - 1] !== "\\") {
      quote = null;
    }

    buf += c;
  }

  if (buf.trim()) out.push(buf.trim());
  return out;
}

const sql = fs.readFileSync(file, "utf8");
const parts = statements(sql);

console.log(`${file}: ${parts.length} statements${dryRun ? " (dry run)" : ""}`);

if (dryRun) {
  parts.forEach((s, i) => console.log(`\n${String(i + 1).padStart(3)}. ${s.replace(/\s+/g, " ").slice(0, 160)}`));
  process.exit(0);
}

const url = new URL(databaseUrl());
const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  // Aiven terminates TLS with its own CA. The alternative to this is shipping
  // the CA bundle around with the repo for a one-shot migration tool.
  ssl: /ssl-mode=required/i.test(url.search) ? { rejectUnauthorized: false } : undefined,
  multipleStatements: false,
});

console.log(`connected to ${url.hostname}/${url.pathname.replace(/^\//, "")}`);

let failed = 0;
for (const [i, statement] of parts.entries()) {
  const short = statement.replace(/\s+/g, " ").slice(0, 90);
  try {
    await conn.query(statement);
    console.log(`  ok   ${String(i + 1).padStart(3)}. ${short}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${String(i + 1).padStart(3)}. ${short}\n       ${err.message}`);
  }
}

await conn.end();
console.log(failed ? `\n${failed} statement(s) failed` : "\napplied cleanly");
process.exit(failed ? 1 : 0);
