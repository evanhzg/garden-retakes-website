// PENTAKILL — multiplayer race mode.
//
// All the mechanics live in RaceGame; this file only supplies the League
// champion pool and its comparison. The solo daily game needs none of this —
// it runs entirely in the browser off pentakillRules.

const RaceGame = require("./raceGame");
const { raceSequence, compare, findChampion, buildPool } = require("./pentakillCore");

class PentakillGame extends RaceGame {
  constructor(lobbyId, opts = {}) {
    super(lobbyId, opts, {
      pool: () => buildPool().all,
      sequence: (seed, n) => raceSequence(seed, n),
      find: (query, pool) => findChampion(query, pool),
      compare,
      labelOf: (c) => c.name,
      // The end screen shows each champion behind their portrait.
      chipOf: (c) => ({ id: c.id, name: c.name, image: c.image }),
    });
  }

  static DEFAULT_OPTIONS = RaceGame.DEFAULT_OPTIONS;
  static sanitizeOptions = RaceGame.sanitizeOptions;
  static TARGET_SCORES = RaceGame.TARGET_SCORES;
  static ROUND_TIMERS = RaceGame.ROUND_TIMERS;
}

module.exports = PentakillGame;
