#!/usr/bin/env node
/**
 * Consistency checks for the two locale dictionaries.
 *
 * These exist because every defect they catch is invisible in review and
 * obvious to a user. A key that is missing from both files renders as its own
 * dotted name on the page. A value containing `&amp;` renders as `&amp;`,
 * because `t()` output is a JSX text child and React escapes it. And a value
 * that is a Title-Case of its own key — "Aria Label", "Search Placeholder" —
 * shows an internal slot name to everybody, since English is the fallback
 * dictionary for French too.
 *
 *   node tools/check-i18n.mjs          # errors fail, findings print
 *   node tools/check-i18n.mjs --all    # also list the informational findings
 *
 * Errors are things a user can see. Warnings are hygiene.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--all");

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const en = read("locales/en.json");
const fr = read("locales/fr.json");

const errors = [];
const warnings = [];

/** Every source file that could call t(). */
function sources(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(rel, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = ["app", "components", "lib"]
  .flatMap((d) => sources(d))
  // The games' dictionary defines keys, it does not consume them, and its
  // `return key` fallback looks exactly like a call site to a regex.
  .filter((f) => f !== path.join("components", "games", "i18n.tsx"));

/**
 * The party games have their own dictionary keyed the same way
 * (`components/games/i18n.tsx`, driven by localStorage rather than the site
 * cookie), and its keys shadow same-named ones in locales/. A key served from
 * there is not a site translation however much it looks like one.
 */
const gameDict = fs.readFileSync(path.join(ROOT, "components/games/i18n.tsx"), "utf8");
const shadowedByGames = (key) =>
  !key.includes(".") && new RegExp(`^\\s*${key}\\s*:\\s*\\{`, "m").test(gameDict);

// ---- keys the code asks for ------------------------------------------------

const used = new Map(); // key -> first "file:line"
for (const file of files) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/\bt\(\s*["'`]([\w.$-]+)["'`]/g)) {
      if (!used.has(m[1])) used.set(m[1], `${file}:${i + 1}`);
    }
  });
}

for (const [key, where] of used) {
  // A key resolved by the games' own dictionary is not ours to provide.
  if (key in en || key in fr || shadowedByGames(key)) continue;
  errors.push(`missing from BOTH dictionaries, renders as raw text: ${key}   (${where})`);
}

// ---- en/fr parity ----------------------------------------------------------

for (const key of Object.keys(en)) {
  if (!(key in fr)) errors.push(`missing from fr, falls back to English: ${key}`);
}
for (const key of Object.keys(fr)) {
  if (!(key in en)) warnings.push(`in fr but not en: ${key}`);
}

// ---- HTML entities ---------------------------------------------------------

const ENTITY = /&(amp|lt|gt|quot|apos|rsquo|lsquo|ldquo|rdquo|ndash|mdash|larr|rarr|hellip|nbsp|#\d+);/;
for (const [name, dict] of [["en", en], ["fr", fr]]) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value === "string" && ENTITY.test(value)) {
      errors.push(`${name}: HTML entity renders literally: ${key} = ${JSON.stringify(value.slice(0, 60))}`);
    }
  }
}

// ---- slot names shown to users ---------------------------------------------

const ROLE = /(aria|placeholder|prefix|suffix|label|title|desc|description|hint|tooltip|count|note|caption|heading|subtitle|empty|nodata|error|loading)/i;
const titleCaseOf = (segment) =>
  segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

let slotNamesInDeadKeys = 0;
for (const [key, value] of Object.entries(en)) {
  if (typeof value !== "string" || !value.trim()) continue;
  const segment = key.split(".").pop();
  const composite = segment.includes("_") || /[a-z][A-Z]/.test(segment);
  if (!composite || !ROLE.test(segment) || value !== titleCaseOf(segment)) continue;

  // A malformed value in a key nothing reads is untidy, not visible. Counting
  // these as errors would make the check cry wolf about the party games, whose
  // real strings live in their own dictionary.
  if (shadowedByGames(key)) {
    slotNamesInDeadKeys++;
    continue;
  }

  errors.push(`en: shows a slot name rather than text: ${key} = ${JSON.stringify(value)}`);
}

// ---- interpolation ---------------------------------------------------------

// t() substitutes {name} from a vars object; a placeholder present in one
// language and absent in the other silently drops a number for those users.
const placeholders = (v) => new Set([...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
for (const [key, value] of Object.entries(en)) {
  if (typeof value !== "string" || !(key in fr)) continue;
  const a = placeholders(value);
  const b = placeholders(fr[key]);
  const lost = [...a].filter((p) => !b.has(p));
  const gained = [...b].filter((p) => !a.has(p));
  if (lost.length) errors.push(`fr drops placeholder(s) ${lost.join(", ")} from ${key}`);
  if (gained.length) errors.push(`fr adds placeholder(s) ${gained.join(", ")} to ${key} — they will render literally`);
}

// ---- hygiene ---------------------------------------------------------------

const dead = Object.keys(en).filter((k) => shadowedByGames(k));
if (dead.length) {
  warnings.push(
    `${dead.length} keys are shadowed by components/games/i18n.tsx and are never read ` +
      `from locales/ (the party games run their own dictionary off localStorage)` +
      (slotNamesInDeadKeys ? `; ${slotNamesInDeadKeys} of them hold a slot name` : ""),
  );
}

const unused = Object.keys(en).filter((k) => !used.has(k) && !shadowedByGames(k));
if (unused.length) warnings.push(`${unused.length} keys are never referenced by a literal t() call`);

// ---- report ----------------------------------------------------------------

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

if (errors.length) {
  console.error(`\n\x1b[31m${plural(errors.length, "error")}\x1b[0m — these are visible to users:\n`);
  for (const e of errors.slice(0, verbose ? Infinity : 40)) console.error(`  ${e}`);
  if (!verbose && errors.length > 40) console.error(`  … and ${errors.length - 40} more (--all)`);
}

if (warnings.length) {
  console.log(`\n\x1b[33m${plural(warnings.length, "warning")}\x1b[0m:\n`);
  for (const w of warnings.slice(0, verbose ? Infinity : 10)) console.log(`  ${w}`);
  if (!verbose && warnings.length > 10) console.log(`  … and ${warnings.length - 10} more (--all)`);
}

if (!errors.length) {
  console.log(
    `\n\x1b[32mi18n clean\x1b[0m — ${Object.keys(en).length} en / ${Object.keys(fr).length} fr, ` +
      `${used.size} keys used in code.`,
  );
}

process.exit(errors.length ? 1 : 0);
