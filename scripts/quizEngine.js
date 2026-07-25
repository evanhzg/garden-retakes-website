// The shared quiz engine behind BUILD PATH (LoL) and BUY MENU (CS2).
//
// A quiz is a deterministic list of questions built from a seed, so a "daily
// challenge" is identical for everyone and a lobby race can hand every player
// the same paper. Games supply *generators*; the engine picks which ones are
// allowed at the chosen difficulty, runs them against a seeded RNG, and
// de-duplicates the result.
//
// A generator returns `null` when it can't build a sensible question from the
// data it drew (too few distractors, a missing field), and the engine simply
// tries another one — so generators stay simple and never have to guarantee
// success.

// ---------------------------------------------------------------------------
// Seeded RNG (same mulberry32 the guessers use)
// ---------------------------------------------------------------------------
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = hashSeed(seed) >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  rand.int = (n) => Math.floor(rand() * n);
  rand.pick = (arr) => arr[Math.floor(rand() * arr.length)];
  rand.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  /** `n` distinct members of `arr`, or null when there aren't enough. */
  rand.sample = (arr, n) => (arr.length < n ? null : rand.shuffle(arr).slice(0, n));
  return rand;
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------
// Tier 1 is recognition, 4 is precise recall. Each tier draws from its own
// generators *and* every easier one, so higher tiers stay varied.
const TIERS = [1, 2, 3, 4];

/**
 * Build a question.
 *
 * @param {object} spec
 * @param {string} spec.id            unique per question kind
 * @param {"mc"|"input"} spec.type
 * @param {object} spec.prompt        `{ key, params }`, rendered by the client
 * @param {Array}  [spec.choices]     `[{ id, label, sub, image }]` for multiple choice
 * @param {string} spec.answer        id of the correct choice, or the accepted text
 * @param {string[]} [spec.accept]    extra accepted spellings for `input`
 * @param {object} [spec.explain]     `{ key, params }` shown after answering
 */
function question(spec) {
  return spec;
}

/**
 * Assemble `count` questions at `tier` from `generators`.
 *
 * @param {object[]} generators  `{ id, tiers:number[], make(rng, data) }`
 * @param {object} data          whatever the generators need
 * @param {object} opts          `{ tier, count, seed }`
 */
function buildQuiz(generators, data, { tier = 1, count = 10, seed = "quiz" } = {}) {
  const rng = makeRng(seed);
  const allowed = generators.filter((g) => g.tiers.includes(tier));
  if (!allowed.length) return [];

  const out = [];
  const seen = new Set();
  // Bounded: a generator that keeps failing must not spin forever.
  const maxAttempts = count * 12;

  for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
    const gen = rng.pick(allowed);
    let q;
    try {
      q = gen.make(rng, data);
    } catch {
      q = null;
    }
    if (!q) continue;

    // Two questions with the same prompt would read as a bug.
    const key = `${gen.id}:${JSON.stringify(q.prompt)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ...q,
      gen: gen.id,
      tier,
      // Stable per-quiz id so the client can key React lists and the server can
      // match a submitted answer back to its question.
      id: `${gen.id}-${out.length}`,
      choices: q.choices ? rng.shuffle(q.choices) : undefined,
    });
  }

  return out;
}

/** The same question with the answer stripped, for sending to a client. */
function publicQuestion(q) {
  const { answer, accept, explain, ...rest } = q;
  return rest;
}

/** Does a submitted answer match? Handles both choice ids and typed text. */
function isCorrect(q, submitted) {
  if (q == null || submitted == null) return false;
  if (q.type === "mc") return String(submitted) === String(q.answer);

  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const target = [q.answer, ...(q.accept || [])].map(norm);
  return target.includes(norm(submitted));
}

module.exports = { makeRng, buildQuiz, question, publicQuestion, isCorrect, TIERS };
