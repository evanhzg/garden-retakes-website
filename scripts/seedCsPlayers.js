#!/usr/bin/env node
// Rebuilds data/csPlayers.json — the player pool behind HEADSHOT (the daily
// CS-pro guessing game). Everything comes from Liquipedia's MediaWiki API:
//
//   1. `Majors/Player Database` gives every player who has ever attended a
//      Valve Major, along with the tournaments they attended. That doubles as
//      the pool *and* as the "Majors played" attribute.
//   2. Each of those players' pages is then fetched in batches of 50 and the
//      `{{Infobox player}}` block is parsed for country, birth date, current
//      team, roles and team history.
//
// Liquipedia's API terms ask for a descriptive User-Agent, gzip, and no more
// than one request every two seconds — all three are honoured below. Re-run
// with `node scripts/seedCsPlayers.js` whenever the roster drifts; the output
// is committed so the app never depends on Liquipedia at runtime.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const API = "https://liquipedia.net/counterstrike/api.php";
const UA = process.env.LIQUIPEDIA_UA
  || "GardenRetakes-HEADSHOT/1.0 (https://games.retakes.fr; pro.evan.dev@gmail.com)";
const OUT = path.join(__dirname, "..", "data", "csPlayers.json");
const THROTTLE_MS = 2100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;
async function api(params) {
  const wait = THROTTLE_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Encoding": "gzip" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${params.titles || params.action}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.info);
  return json;
}

/** Wikitext of one or more pages (up to 50 titles per call). */
async function wikitext(titles) {
  const data = await api({
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    titles: titles.join("|"),
    redirects: "1",
  });
  const pages = data.query?.pages || {};
  // `normalized` / `redirects` let us map what we asked for back to what we got.
  const alias = new Map();
  for (const n of data.query?.normalized || []) alias.set(n.to, n.from);
  for (const r of data.query?.redirects || []) alias.set(r.to, alias.get(r.from) ?? r.from);

  const out = new Map();
  for (const page of Object.values(pages)) {
    if (page.missing !== undefined || !page.revisions) continue;
    const asked = alias.get(page.title) ?? page.title;
    out.set(asked, page.revisions[0].slots.main["*"]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 1 — the Majors participation table
// ---------------------------------------------------------------------------

/**
 * The page is one collapsible table per player: a `{{player|flag=xx|Name}}`
 * header followed by one row per Major attended. Slicing the source between
 * consecutive headers gives each player's rows without having to parse the
 * (deeply nested) wikitable structure.
 */
function parseMajorDatabase(src) {
  const headerRe = /\{\{player\|([^}]*)\}\}/g;
  const headers = [];
  let m;
  while ((m = headerRe.exec(src))) headers.push({ index: m.index, end: headerRe.lastIndex, args: m[1] });

  const players = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const body = src.slice(h.end, i + 1 < headers.length ? headers[i + 1].index : src.length);

    const args = h.args.split("|").map((s) => s.trim());
    const named = {};
    const positional = [];
    for (const a of args) {
      const eq = a.indexOf("=");
      if (eq > 0) named[a.slice(0, eq).trim()] = a.slice(eq + 1).trim();
      else if (a) positional.push(a);
    }
    const name = named.link || positional[0];
    if (!name) continue;

    // `|[[Event/Page|Event Name]] {{TeamPart|team|YYYY-MM-DD}} || {{Placement|n}}`
    const rows = [...body.matchAll(/\{\{TeamPart\|([^|}]*)\|(\d{4})-(\d{2})-(\d{2})\}\}/g)];
    if (rows.length === 0) continue;

    const years = rows.map((r) => Number(r[2]));
    players.push({
      page: name,
      display: positional[0],
      flag: (named.flag || "").toLowerCase(),
      majors: rows.length,
      firstMajorYear: Math.min(...years),
      lastMajorYear: Math.max(...years),
      majorTeams: [...new Set(rows.map((r) => r[1].trim()).filter(Boolean))],
    });
  }
  return players;
}

// ---------------------------------------------------------------------------
// Step 2 — player infoboxes
// ---------------------------------------------------------------------------

/** Pull `{{Infobox player ... }}` out of a page and split it into fields. */
function parseInfobox(src) {
  const start = src.search(/\{\{Infobox player/i);
  if (start === -1) return null;

  // Walk braces so nested templates (team_history, links…) don't end it early.
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length - 1; i++) {
    if (src[i] === "{" && src[i + 1] === "{") { depth++; i++; continue; }
    if (src[i] === "}" && src[i + 1] === "}") {
      depth--;
      i++;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  const block = src.slice(start, end);

  // Split on top-level pipes only.
  const fields = {};
  let depth2 = 0;
  let buf = "";
  const parts = [];
  for (let i = 0; i < block.length; i++) {
    const two = block.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth2++; buf += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth2--; buf += two; i++; continue; }
    if (block[i] === "|" && depth2 === 1) { parts.push(buf); buf = ""; continue; }
    buf += block[i];
  }
  parts.push(buf);

  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    let value = p.slice(eq + 1).trim();
    if (value.endsWith("}}")) value = value.slice(0, -2).trim();
    fields[key] = value;
  }
  fields.__block = block;
  return fields;
}

/**
 * Team names the player has ever been rostered on, oldest first.
 *
 * Rows look like `{{TH|2018-01-11 — 2021-04-23|Astralis}}`, sometimes with a
 * trailing note (`|Inactive`) or a `link=` override — so the team is always the
 * second positional argument, never the last one. Unknown teams are written as
 * `?` or with `??` in the dates; those are dropped.
 */
function parseTeamHistory(block) {
  const out = [];
  for (const m of block.matchAll(/\{\{TH\|([^}]*)\}\}/g)) {
    const positional = m[1]
      .split("|")
      .map((s) => s.trim())
      .filter((s) => !/^[a-z_]+=/i.test(s));
    const team = stripWiki(positional[1] || "");
    if (!team || team === "?" || team.includes("??")) continue;
    if (/^(inactive|stand-in|standin|streamer|retired|benched|coach)$/i.test(team)) continue;
    out.push(team);
  }
  // De-dupe while keeping the *last* occurrence order (rejoining a team should
  // put it back at the end, which is what "most recent team" reads off of).
  const seen = new Set();
  const deduped = [];
  for (let i = out.length - 1; i >= 0; i--) {
    if (seen.has(out[i])) continue;
    seen.add(out[i]);
    deduped.unshift(out[i]);
  }
  return deduped;
}

/** Liquipedia writes birth dates unpadded (`1997-2-16`) or as a template. */
function parseBirthDate(raw) {
  const s = String(raw || "").trim();
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) m = /\{\{[Bb]irth date[^|]*\|(\d{4})\|(\d{1,2})\|(\d{1,2})/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  if (year < 1970 || year > new Date().getFullYear() - 12) return null;
  return { year, iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

const stripWiki = (s) =>
  String(s || "")
    .replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .trim();

// ---------------------------------------------------------------------------
// Country → region + French name. Only countries that actually show up at a
// Major need an entry; anything unmapped falls back to "Other".
// ---------------------------------------------------------------------------
const COUNTRIES = require("./csCountries");

const ROLE_ORDER = ["awp", "igl", "entry", "lurker", "support", "rifle", "coach"];
const ROLE_ALIASES = {
  awp: "awp", awper: "awp", sniper: "awp",
  igl: "igl", "in-game leader": "igl", captain: "igl",
  entry: "entry", "entry fragger": "entry", opener: "entry",
  lurk: "lurker", lurker: "lurker",
  support: "support", anchor: "support",
  rifle: "rifle", rifler: "rifle",
  coach: "coach", analyst: "coach",
};

function normalizeRoles(raw) {
  const found = new Set();
  for (const piece of String(raw || "").split(/[,/;]/)) {
    const key = piece.trim().toLowerCase();
    if (ROLE_ALIASES[key]) found.add(ROLE_ALIASES[key]);
  }
  const list = ROLE_ORDER.filter((r) => found.has(r));
  return list.length ? list : ["rifle"];
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("→ fetching Majors/Player Database …");
  const dbPage = await wikitext(["Majors/Player Database"]);
  const raw = dbPage.get("Majors/Player Database");
  if (!raw) throw new Error("Majors/Player Database came back empty");

  const roster = parseMajorDatabase(raw);
  console.log(`  ${roster.length} players have attended a Major`);

  console.log("→ fetching player infoboxes …");
  const byPage = new Map(roster.map((p) => [p.page, p]));
  const titles = [...byPage.keys()];
  const players = [];
  const skipped = [];

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    let pages;
    try {
      pages = await wikitext(batch);
    } catch (err) {
      console.warn(`  batch ${i / 50 + 1} failed (${err.message}) — retrying once`);
      await sleep(5000);
      pages = await wikitext(batch);
    }

    for (const title of batch) {
      const src = pages.get(title);
      const meta = byPage.get(title);
      if (!src) { skipped.push(`${title}: page missing`); continue; }

      const box = parseInfobox(src);
      if (!box) { skipped.push(`${title}: no infobox`); continue; }

      const country = stripWiki(box.country || box.nationality || "");
      const info = COUNTRIES[country] || null;
      const birth = parseBirthDate(box.birth_date);
      const history = parseTeamHistory(box.__block);
      const currentTeam = stripWiki(box.team || "") || null;
      const status = (stripWiki(box.status) || "Active").toLowerCase();

      players.push({
        id: title.replace(/\s+/g, "_"),
        name: stripWiki(box.id) || meta.display || title,
        // Old handles (dev1ce was "device") so search finds them either way.
        aliases: String(box.ids || "")
          .split(",")
          .map((s) => stripWiki(s))
          .filter((s) => s && s.toLowerCase() !== stripWiki(box.id).toLowerCase()),
        realName: stripWiki(box.romanized_name || box.name || ""),
        country: country || "Unknown",
        cc: (info?.cc || meta.flag || "").toLowerCase(),
        region: info?.region || "Other",
        countryFr: info?.fr || country || "Inconnu",
        // Retired players keep their last known roster as the Team attribute.
        team: currentTeam || history[history.length - 1] || null,
        onTeam: !!currentTeam,
        teamHistory: history,
        roles: normalizeRoles(box.roles),
        birthYear: birth?.year ?? null,
        birthDate: birth?.iso ?? null,
        majors: meta.majors,
        firstMajorYear: meta.firstMajorYear,
        lastMajorYear: meta.lastMajorYear,
        status: status.startsWith("retire") ? "retired" : status.startsWith("inactive") ? "inactive" : "active",
      });
    }
    console.log(`  ${Math.min(i + 50, titles.length)}/${titles.length}`);
  }

  // Every attribute has to be answerable for a player to be guessable at all.
  const complete = players.filter((p) => p.birthYear && p.team);
  const answerable = complete.filter((p) => p.onTeam && p.status === "active");
  console.log(`→ ${players.length} parsed · ${complete.length} guessable · ${answerable.length} can be the answer`);
  if (skipped.length) console.log(`  skipped ${skipped.length}:`, skipped.slice(0, 8).join(", "));

  players.sort((a, b) => b.majors - a.majors || a.name.localeCompare(b.name));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "https://liquipedia.net/counterstrike (CC-BY-SA 3.0)",
    count: players.length,
    players,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
  console.log(`✓ wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
