// HEADSHOT — the player pool, bound to the committed dataset.
//
// The rules themselves live in headshotRules.js (no data, safe to bundle for
// the browser). This module is the server-side half: it loads
// data/csPlayers.json, decides who is famous enough to *be* an answer, and
// re-exports the rules with the pool already applied.

const DATA = require("../data/csPlayers.json");
const rules = require("./headshotRules");

const CURRENT_YEAR = new Date().getUTCFullYear();

/**
 * How likely a player is to be recognised: Major appearances, weighted heavily
 * towards anyone who has been at a recent one, plus a bump for still being on a
 * roster. Only used to decide who can *be* the answer — you may always guess
 * anyone in the pool.
 */
function fameOf(player) {
  const recency =
    player.lastMajorYear >= CURRENT_YEAR - 1 ? 14
      : player.lastMajorYear >= CURRENT_YEAR - 3 ? 7
      : player.lastMajorYear >= CURRENT_YEAR - 6 ? 2
      : 0;
  return player.majors * 3 + recency + (player.onTeam ? 4 : 0);
}

/** Everything needed to render and compare one player, and nothing else. */
function toEntry(player) {
  return {
    id: player.id,
    name: player.name,
    aliases: player.aliases || [],
    realName: player.realName,
    country: player.country,
    countryFr: player.countryFr,
    cc: player.cc,
    region: player.region,
    team: player.team,
    teamHistory: player.teamHistory || [],
    roles: player.roles,
    birthDate: player.birthDate,
    majors: player.majors,
    status: player.status,
  };
}

let _cache = null;

/**
 * `all` is everyone you may type in; `answers` is the shortlist a puzzle can
 * actually pick from, ordered by fame so the daily stays guessable.
 */
function buildPool() {
  if (_cache) return _cache;

  const complete = DATA.players.filter((p) => p.birthDate && p.team && p.roles && p.roles.length);
  const all = complete
    .map(toEntry)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const answers = complete
    .filter((p) => p.status === "active" && p.onTeam)
    .sort((a, b) => fameOf(b) - fameOf(a))
    .map(toEntry);

  _cache = { all, answers, generatedAt: DATA.generatedAt, source: DATA.source };
  return _cache;
}

// How deep into the fame-ranked list each mode reaches.
const DIFFICULTY = { daily: 150, endless: 320, race: 220 };

function answerPool(mode = "daily") {
  const { answers } = buildPool();
  return answers.slice(0, Math.min(answers.length, DIFFICULTY[mode] ?? DIFFICULTY.daily));
}

function dailyAnswer(dateKey, mode = "daily") {
  return rules.pickDaily(answerPool(mode), dateKey, mode);
}

function raceSequence(seed, length, mode = "race") {
  return rules.pickSequence(answerPool(mode), seed, length);
}

function findPlayer(query, pool) {
  return rules.findPlayer(query, pool || buildPool().all);
}

module.exports = {
  ...rules,
  buildPool,
  answerPool,
  dailyAnswer,
  raceSequence,
  findPlayer,
  fameOf,
  DIFFICULTY,
};
