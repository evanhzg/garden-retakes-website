#!/usr/bin/env node
// Rebuilds data/lolChampions.json and data/lolItems.json — the datasets behind
// PENTAKILL (the daily champion guesser) and BUILD PATH (the item/meta quiz).
//
// Two sources, because neither alone is enough:
//
//   * Riot Data Dragon is authoritative for what exists on the live patch:
//     the champion roster, every item, its build path, cost and stats. It has
//     no release dates, lore regions or lane assignments.
//   * The League wiki's `Module:ChampionData/data` fills exactly those gaps
//     (release date, positions, resource, range type, damage type, difficulty,
//     ability names), and `Module:UniverseData/data` maps champions to their
//     Runeterra region. Both are Lua, hence scripts/luaTable.js.
//
// Champions are intersected with the Data Dragon roster so wiki-only entries
// (unreleased champions, "Mega Gnar"-style forms) never reach the game.
//
// Re-run with `node scripts/seedLol.js` after a patch; the output is committed
// so nothing depends on either source at runtime.

const fs = require("fs");
const path = require("path");
const { parseLuaTable } = require("./luaTable");

const DDRAGON = "https://ddragon.leagueoflegends.com";
const WIKI = "https://wiki.leagueoflegends.com/en-us/api.php";
const UA = process.env.WIKI_UA
  || "GardenRetakes-LoL/1.0 (https://games.retakes.fr; pro.evan.dev@gmail.com)";
const OUT_DIR = path.join(__dirname, "..", "data");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, label) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip" } });
  if (!res.ok) throw new Error(`${label}: ${res.status} ${res.statusText}`);
  return res.json();
}

/** One wiki Lua module, parsed. The wiki asks for a descriptive UA + throttling. */
async function getLuaModule(title) {
  const url = `${WIKI}?${new URLSearchParams({
    action: "query", format: "json", prop: "revisions",
    rvprop: "content", rvslots: "main", titles: title,
  })}`;
  const data = await getJson(url, title);
  const page = Object.values(data.query.pages)[0];
  if (!page || !page.revisions) throw new Error(`${title} is missing`);
  return parseLuaTable(page.revisions[0].slots.main["*"]);
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------
/**
 * Champion → Runeterra region(s).
 *
 * The faction entries list who they star, which is the canonical "belongs to"
 * relation. Champions with no faction (Bard, Kindred, the darkin…) fall back to
 * the region on their own Biography entry, and finally to Runeterra itself.
 */
function buildRegionMap(universe) {
  const byFaction = {};
  const byBio = {};

  for (const [name, entry] of Object.entries(universe)) {
    if (!entry || typeof entry !== "object") continue;

    if (entry.loretype === "Faction" && Array.isArray(entry.starring)) {
      for (const champ of entry.starring) (byFaction[champ] = byFaction[champ] || []).push(name);
    }

    if (entry.loretype === "Biography" && Array.isArray(entry.starring) && Array.isArray(entry.region)) {
      for (const champ of entry.starring) {
        if (!byBio[champ]) byBio[champ] = entry.region.filter((r) => r !== "Runeterra");
      }
    }
  }

  return (championName) => {
    const hit = byFaction[championName] || byBio[championName];
    return hit && hit.length ? [...new Set(hit)] : ["Runeterra"];
  };
}

// ---------------------------------------------------------------------------
const stripTags = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  console.log("→ resolving the live patch …");
  const versions = await getJson(`${DDRAGON}/api/versions.json`, "versions");
  const patch = versions[0];
  console.log(`  patch ${patch}`);

  console.log("→ fetching Data Dragon …");
  const [champEn, champFr, itemEn, itemFr] = await Promise.all([
    getJson(`${DDRAGON}/cdn/${patch}/data/en_US/champion.json`, "champion en"),
    getJson(`${DDRAGON}/cdn/${patch}/data/fr_FR/champion.json`, "champion fr"),
    getJson(`${DDRAGON}/cdn/${patch}/data/en_US/item.json`, "item en"),
    getJson(`${DDRAGON}/cdn/${patch}/data/fr_FR/item.json`, "item fr"),
  ]);

  console.log("→ fetching the League wiki data modules …");
  const wikiChampions = await getLuaModule("Module:ChampionData/data");
  await sleep(1200);
  const universe = await getLuaModule("Module:UniverseData/data");
  const regionsOf = buildRegionMap(universe);

  // ---- champions --------------------------------------------------------
  // Index the wiki by Data Dragon's apiname so the two line up.
  const wikiByApi = {};
  for (const [wikiName, entry] of Object.entries(wikiChampions)) {
    if (entry && entry.apiname) wikiByApi[entry.apiname] = { wikiName, ...entry };
  }

  const champions = [];
  const skipped = [];

  for (const [apiName, dd] of Object.entries(champEn.data)) {
    const w = wikiByApi[apiName];
    if (!w) { skipped.push(apiName); continue; }

    const positions = (w.client_positions && w.client_positions.length ? w.client_positions : w.external_positions) || [];
    const classes = [w.herotype, w.alttype].filter(Boolean);
    const release = String(w.date || "").slice(0, 10);

    champions.push({
      id: apiName,
      key: Number(dd.key),
      name: dd.name,
      nameFr: champFr.data[apiName] ? champFr.data[apiName].name : dd.name,
      title: dd.title,
      titleFr: champFr.data[apiName] ? champFr.data[apiName].title : dd.title,
      classes,
      positions,
      regions: regionsOf(w.wikiName),
      resource: w.resource || "None",
      rangeType: w.rangetype || (Number(w.stats && w.stats.range) > 300 ? "Ranged" : "Melee"),
      damageType: w.adaptivetype || "Physical",
      difficulty: Number(w.difficulty) || null,
      releaseDate: release || null,
      releaseYear: release ? Number(release.slice(0, 4)) : null,
      attackRange: Number(w.stats && w.stats.range) || null,
      moveSpeed: Number(w.stats && w.stats.ms) || null,
      ratings: {
        damage: Number(w.damage) || 0,
        toughness: Number(w.toughness) || 0,
        control: Number(w.control) || 0,
        mobility: Number(w.mobility) || 0,
        utility: Number(w.utility) || 0,
      },
      be: Number(w.be) || null,
      rp: Number(w.rp) || null,
      skills: Array.isArray(w.skills) ? w.skills.filter((s) => typeof s === "string") : [],
      image: dd.image ? dd.image.full : `${apiName}.png`,
    });
  }

  champions.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  console.log(`→ ${champions.length} champions (${skipped.length} without wiki data: ${skipped.join(", ") || "none"})`);

  // ---- items ------------------------------------------------------------
  // Summoner's Rift only, actually buyable, and not a hidden/ornn upgrade —
  // otherwise the quiz would ask about items no player has ever seen.
  const items = [];
  for (const [id, it] of Object.entries(itemEn.data)) {
    if (!it.maps || it.maps["11"] !== true) continue;
    if (!it.gold || !it.gold.purchasable || it.gold.total <= 0) continue;
    if (it.inStore === false) continue;
    if (it.requiredAlly || it.requiredChampion) continue;

    items.push({
      id,
      name: it.name,
      nameFr: itemFr.data[id] ? itemFr.data[id].name : it.name,
      plaintext: it.plaintext || "",
      plaintextFr: itemFr.data[id] ? itemFr.data[id].plaintext || "" : "",
      description: stripTags(it.description).slice(0, 400),
      gold: { base: it.gold.base, total: it.gold.total, sell: it.gold.sell },
      tags: it.tags || [],
      from: it.from || [],
      into: (it.into || []).filter((x) => itemEn.data[x]),
      depth: it.depth || 1,
      stats: it.stats || {},
      image: it.image ? it.image.full : `${id}.png`,
    });
  }
  items.sort((a, b) => a.gold.total - b.gold.total || a.name.localeCompare(b.name));
  console.log(`→ ${items.length} Summoner's Rift items`);

  // ---- write ------------------------------------------------------------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const meta = {
    generatedAt: new Date().toISOString(),
    patch,
    sources: [
      "https://developer.riotgames.com/docs/lol#data-dragon (Riot Data Dragon)",
      "https://wiki.leagueoflegends.com (CC-BY-SA)",
    ],
  };

  const champPath = path.join(OUT_DIR, "lolChampions.json");
  const itemPath = path.join(OUT_DIR, "lolItems.json");
  fs.writeFileSync(champPath, JSON.stringify({ ...meta, count: champions.length, champions }, null, 1));
  fs.writeFileSync(itemPath, JSON.stringify({ ...meta, count: items.length, items }, null, 1));
  console.log(`✓ ${champPath} (${(fs.statSync(champPath).size / 1024).toFixed(0)} KB)`);
  console.log(`✓ ${itemPath} (${(fs.statSync(itemPath).size / 1024).toFixed(0)} KB)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
