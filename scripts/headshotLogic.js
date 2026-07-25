// HEADSHOT — multiplayer race mode.
//
// All the mechanics live in RaceGame; this file only supplies the CS pro pool
// and its comparison. The solo daily game needs none of this — it runs entirely
// in the browser off headshotRules.

const RaceGame = require("./raceGame");
const { raceSequence, compare, findPlayer, buildPool } = require("./headshotCore");

class HeadshotGame extends RaceGame {
  constructor(lobbyId, opts = {}) {
    super(lobbyId, opts, {
      pool: () => buildPool().all,
      sequence: (seed, n) => raceSequence(seed, n, "race"),
      find: (query, pool) => findPlayer(query, pool),
      compare,
      labelOf: (p) => p.name,
      // The end screen shows each pro behind their flag.
      chipOf: (p) => ({ id: p.id, name: p.name, cc: p.cc }),
    });
  }

  static DEFAULT_OPTIONS = RaceGame.DEFAULT_OPTIONS;
  static sanitizeOptions = RaceGame.sanitizeOptions;
  static TARGET_SCORES = RaceGame.TARGET_SCORES;
  static ROUND_TIMERS = RaceGame.ROUND_TIMERS;
}

module.exports = HeadshotGame;
