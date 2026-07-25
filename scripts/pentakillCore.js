// PENTAKILL — the champion pool, bound to the committed dataset.
//
// The rules live in pentakillRules.js (no data, safe to bundle for the
// browser). This module is the server-side half: it loads
// data/lolChampions.json and re-exports the rules with the pool applied.
//
// Unlike HEADSHOT there is no fame filter — every live champion is famous
// enough to be an answer, so the guess pool and the answer pool are the same.

const DATA = require("../data/lolChampions.json");
const rules = require("./pentakillRules");

let _cache = null;

function buildPool() {
  if (_cache) return _cache;

  const all = DATA.champions
    .filter((c) => c.releaseYear && c.positions.length && c.regions.length)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  _cache = { all, answers: all, patch: DATA.patch, generatedAt: DATA.generatedAt };
  return _cache;
}

function answerPool() {
  return buildPool().answers;
}

function dailyAnswer(dateKey, mode = "daily") {
  return rules.pickDaily(answerPool(), dateKey, `pentakill:${mode}`);
}

function raceSequence(seed, length) {
  return rules.pickSequence(answerPool(), seed, length);
}

function findChampion(query, pool) {
  return rules.findChampion(query, pool || buildPool().all);
}

module.exports = {
  ...rules,
  buildPool,
  answerPool,
  dailyAnswer,
  raceSequence,
  findChampion,
};
