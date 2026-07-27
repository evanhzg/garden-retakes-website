// BUY MENU — the CS2 quiz, bound to the curated reference data.
//
// Wraps the shared quiz engine with the CS2 question bank. Used by the API
// route (which builds the client's quiz) and by the Socket.IO server (which
// builds and marks the lobby race).

const REF = require("../data/cs2Reference.json");
const { GENERATORS } = require("./buymenuQuestions");
const engine = require("./quizEngine");
const fs = require('fs');
const path = require('path');

function buildData() {
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cs2Meta.json'), 'utf8')); } catch(e) {}
  return {
    weapons: REF.weapons,
    utility: REF.utility,
    gear: REF.gear,
    economy: REF.economy,
    maps: REF.maps,
    meta,
  };
}

/** A deterministic quiz: the same seed + tier always yields the same paper. */
function makeQuiz({ tier = 1, count = 10, seed = "buymenu" } = {}) {
  return engine.buildQuiz(GENERATORS, buildData(), { tier, count, seed });
}

module.exports = {
  ...engine,
  GENERATORS,
  buildData,
  makeQuiz,
  reference: REF,
};
