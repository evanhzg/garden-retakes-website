// BUILD PATH — lobby race mode. All the mechanics live in QuizRace; this only
// binds the League question bank.

const QuizRace = require("./quizRace");
const { makeQuiz } = require("./buildpathCore");

class BuildPathGame extends QuizRace {
  constructor(lobbyId, opts = {}) {
    super(lobbyId, opts, makeQuiz);
  }

  static DEFAULT_OPTIONS = QuizRace.DEFAULT_OPTIONS;
  static sanitizeOptions = QuizRace.sanitizeOptions;
}

module.exports = BuildPathGame;
