// HEADSHOT — the rules, with no data attached.
//
// Deliberately free of any `require` of the player dataset: the browser imports
// this module and gets the pool over the wire from /api/headshot/players, while
// the Socket.IO server imports it through headshotCore (which does bind the
// data). Keeping them apart means the 400 KB dataset never lands in a client
// bundle, and both sides still score a guess with the exact same code.

// ---------------------------------------------------------------------------
// Deterministic randomness — mulberry32 over an FNV-1a seed.
// ---------------------------------------------------------------------------
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seedStr) {
  const rand = mulberry32(hashSeed(String(seedStr)));
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;

/** Today in UTC as `YYYY-MM-DD` — the key every client agrees on. */
function todayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Milliseconds until the next puzzle flips over. */
function msUntilNextDay(now = Date.now()) {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS - now;
}

/** Age on a given UTC date, from the stored birth date. */
function ageOf(player, onDate) {
  if (!player || !player.birthDate) return null;
  const [y, m, d] = player.birthDate.split("-").map(Number);
  const ref = onDate ? new Date(onDate) : new Date();
  let age = ref.getUTCFullYear() - y;
  const beforeBirthday =
    ref.getUTCMonth() + 1 < m || (ref.getUTCMonth() + 1 === m && ref.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

// ---------------------------------------------------------------------------
// Picking answers
// ---------------------------------------------------------------------------
/**
 * The answer for a date, out of an already fame-ranked pool. The pool is
 * re-shuffled once per full cycle and walked in order, so a pro can't come back
 * until every other one has had a turn.
 */
function pickDaily(pool, dateKey, mode = "daily") {
  if (!pool || !pool.length) return null;
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS);
  const cycle = Math.floor(day / pool.length);
  const index = ((day % pool.length) + pool.length) % pool.length;
  return seededShuffle(pool, `${mode}:${cycle}`)[index];
}

/** A shuffled run of answers for a multiplayer race (or endless practice). */
function pickSequence(pool, seed, length) {
  if (!pool || !pool.length) return [];
  const shuffled = seededShuffle(pool, seed);
  const out = [];
  for (let i = 0; i < length; i++) out.push(shuffled[i % shuffled.length]);
  return out;
}

// ---------------------------------------------------------------------------
// Comparing a guess
// ---------------------------------------------------------------------------
const ATTRIBUTES = ["nationality", "team", "role", "age", "majors"];

/** How close two numbers have to be to earn a "nearly" instead of a miss. */
const NEAR = { age: 2, majors: 2 };

function compareNumber(guess, target, slack) {
  if (guess == null || target == null) return { state: "miss", dir: null };
  if (guess === target) return { state: "hit", dir: null };
  return {
    state: Math.abs(guess - target) <= slack ? "near" : "miss",
    // The arrow points at where the answer is, not where the guess is.
    dir: target > guess ? "up" : "down",
  };
}

/**
 * Compare one guess against the answer. Every attribute resolves to
 * hit (exact) / near (same continent, shared team history, shared role, close
 * number) / miss, which is exactly what the grid colours in.
 */
function compare(guess, target, onDate) {
  const guessRoles = new Set(guess.roles || []);
  const targetRoles = new Set(target.roles || []);
  const sharedRole = [...guessRoles].some((r) => targetRoles.has(r));
  const sameRoles = guessRoles.size === targetRoles.size && sharedRole
    && [...guessRoles].every((r) => targetRoles.has(r));

  // A team is "near" when either player has ever been on the other's roster.
  const guessTeams = new Set([...(guess.teamHistory || []), guess.team].filter(Boolean));
  const targetTeams = new Set([...(target.teamHistory || []), target.team].filter(Boolean));

  const guessAge = ageOf(guess, onDate);
  const targetAge = ageOf(target, onDate);

  return {
    correct: guess.id === target.id,
    nationality: {
      state: guess.country === target.country ? "hit" : guess.region === target.region ? "near" : "miss",
      dir: null,
    },
    team: {
      state: guess.team === target.team ? "hit"
        : guessTeams.has(target.team) || targetTeams.has(guess.team) ? "near"
        : "miss",
      dir: null,
    },
    role: {
      state: sameRoles ? "hit" : sharedRole ? "near" : "miss",
      dir: null,
    },
    age: { ...compareNumber(guessAge, targetAge, NEAR.age), value: guessAge },
    majors: { ...compareNumber(guess.majors, target.majors, NEAR.majors), value: guess.majors },
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function normalizeName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Exact match on nickname or an old handle, case- and accent-insensitively. */
function findPlayer(query, pool) {
  const q = normalizeName(query);
  if (!q || !pool) return null;
  return (
    pool.find((p) => normalizeName(p.name) === q) ||
    pool.find((p) => (p.aliases || []).some((a) => normalizeName(a) === q)) ||
    null
  );
}

/** Ranked autocomplete: prefix hits first, then substring, then real names. */
function searchPlayers(query, pool, limit = 8, exclude = []) {
  const q = normalizeName(query);
  if (!q || !pool) return [];
  const skip = new Set(exclude);
  const scored = [];

  for (const p of pool) {
    if (skip.has(p.id)) continue;
    const name = normalizeName(p.name);
    const alias = (p.aliases || []).map(normalizeName);
    const real = normalizeName(p.realName);

    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (alias.some((a) => a.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    else if (real.includes(q)) score = 4;
    else if (alias.some((a) => a.includes(q))) score = 5;
    if (score >= 0) scored.push({ p, score });
  }

  scored.sort((a, b) => a.score - b.score || a.p.name.length - b.p.name.length);
  return scored.slice(0, limit).map((s) => s.p);
}

module.exports = {
  seededShuffle,
  todayKey,
  msUntilNextDay,
  ageOf,
  pickDaily,
  pickSequence,
  compare,
  findPlayer,
  searchPlayers,
  normalizeName,
  ATTRIBUTES,
};
