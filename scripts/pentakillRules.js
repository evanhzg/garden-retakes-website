// PENTAKILL — the rules, with no data attached.
//
// Same split as headshotRules.js: this half is safe to bundle for the browser,
// while pentakillCore.js binds data/lolChampions.json for the Socket.IO server
// and the API route. Both sides therefore score a guess with identical code.

const {
  seededShuffle, todayKey, msUntilNextDay, pickDaily, pickSequence, normalizeName,
} = require("./headshotRules");

// The order here is the order of the columns on the board.
const ATTRIBUTES = ["classes", "positions", "regions", "resource", "rangeType", "damageType", "releaseYear", "difficulty", "attackRange", "be"];

/** How far off a release year can be and still count as "close". */
const YEAR_SLACK = 2;

const asSet = (v) => new Set(Array.isArray(v) ? v : v == null ? [] : [v]);

/**
 * Compare two lists: every element shared → hit, some overlap → near.
 * Used for class, position and region, all of which can hold several values.
 */
function compareSet(guess, target) {
  const a = asSet(guess);
  const b = asSet(target);
  if (a.size === 0 && b.size === 0) return { state: "hit" };
  const shared = [...a].filter((x) => b.has(x));
  if (!shared.length) return { state: "miss" };
  return { state: a.size === b.size && shared.length === a.size ? "hit" : "near" };
}

const compareExact = (guess, target) => ({ state: guess === target ? "hit" : "miss" });

function compareYear(guess, target) {
  if (guess == null || target == null) return { state: "miss", dir: null };
  if (guess === target) return { state: "hit", dir: null };
  return {
    state: Math.abs(guess - target) <= YEAR_SLACK ? "near" : "miss",
    // The arrow points at where the answer is, not where the guess is.
    dir: target > guess ? "up" : "down",
  };
}

function compareNumber(guess, target, slack) {
  if (guess == null || target == null) return { state: "miss", dir: null };
  if (guess === target) return { state: "hit", dir: null };
  return {
    state: Math.abs(guess - target) <= slack ? "near" : "miss",
    dir: target > guess ? "up" : "down",
  };
}

/**
 * Score one champion guess. Every attribute resolves to hit / near / miss,
 * which is exactly what the board colours in.
 */
function compare(guess, target) {
  return {
    correct: guess.id === target.id,
    classes: compareSet(guess.classes, target.classes),
    positions: compareSet(guess.positions, target.positions),
    regions: compareSet(guess.regions, target.regions),
    resource: compareExact(guess.resource, target.resource),
    rangeType: compareExact(guess.rangeType, target.rangeType),
    damageType: compareExact(guess.damageType, target.damageType),
    releaseYear: { ...compareYear(guess.releaseYear, target.releaseYear), value: guess.releaseYear },
    difficulty: { ...compareNumber(guess.difficulty, target.difficulty, 0), value: guess.difficulty },
    attackRange: { ...compareNumber(guess.attackRange, target.attackRange, 25), value: guess.attackRange },
    be: { ...compareNumber(guess.be, target.be, 0), value: guess.be },
  };
}

/** Exact match on the champion's name in either language. */
function findChampion(query, pool) {
  const q = normalizeName(query);
  if (!q || !pool) return null;
  return (
    pool.find((c) => normalizeName(c.name) === q) ||
    pool.find((c) => normalizeName(c.nameFr) === q) ||
    pool.find((c) => normalizeName(c.id) === q) ||
    null
  );
}

/** Ranked autocomplete: prefix hits first, then substring, then the title. */
function searchChampions(query, pool, limit = 8, exclude = []) {
  const q = normalizeName(query);
  if (!q || !pool) return [];
  const skip = new Set(exclude);
  const scored = [];

  for (const c of pool) {
    if (skip.has(c.id)) continue;
    const name = normalizeName(c.name);
    const fr = normalizeName(c.nameFr);
    const title = normalizeName(c.title);

    let score = -1;
    if (name === q || fr === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (fr.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (fr.includes(q)) score = 4;
    else if (title.includes(q)) score = 5;
    if (score >= 0) scored.push({ c, score });
  }

  scored.sort((a, b) => a.score - b.score || a.c.name.length - b.c.name.length);
  return scored.slice(0, limit).map((s) => s.c);
}

module.exports = {
  seededShuffle,
  todayKey,
  msUntilNextDay,
  pickDaily,
  pickSequence,
  normalizeName,
  compare,
  compareSet,
  findChampion,
  searchChampions,
  ATTRIBUTES,
  YEAR_SLACK,
};
