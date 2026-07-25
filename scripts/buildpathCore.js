// BUILD PATH — the LoL quiz, bound to the committed datasets.
//
// Wraps the shared quiz engine with the League question bank and the item /
// champion data. Used by the API route (which builds the client's quiz) and by
// the Socket.IO server (which builds and marks the lobby race).

const CHAMPS = require("../data/lolChampions.json");
const ITEMS = require("../data/lolItems.json");
const { GENERATORS } = require("./buildpathQuestions");
const engine = require("./quizEngine");

let _cache = null;

function buildData(lang = "en") {
  if (_cache && _cache.lang === lang) return _cache;

  // Only items a player actually buys — no starter-only oddities with no path.
  // The name de-dupe is belt-and-braces: the seeder already drops the Arena
  // reprints, but a future data refresh must not be able to put two identically
  // named items in the same set of choices.
  const seen = new Set();
  const items = ITEMS.items.filter((it) => {
    if (it.gold.total < 300) return false;
    if (seen.has(it.name)) return false;
    seen.add(it.name);
    return true;
  });
  const byId = new Map(items.map((it) => [it.id, it]));
  const champions = CHAMPS.champions.filter((c) => c.releaseYear && c.regions.length && c.classes.length);

  _cache = { lang, items, byId, champions, patch: ITEMS.patch, generatedAt: ITEMS.generatedAt };
  return _cache;
}

/** A deterministic quiz: the same seed + tier always yields the same paper. */
function makeQuiz({ tier = 1, count = 10, seed = "buildpath", lang = "en" } = {}) {
  return engine.buildQuiz(GENERATORS, buildData(lang), { tier, count, seed });
}

module.exports = {
  ...engine,
  GENERATORS,
  buildData,
  makeQuiz,
  patch: () => ITEMS.patch,
};
