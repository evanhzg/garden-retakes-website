// BUY MENU — lobby race mode. All the mechanics live in QuizRace; this only
// binds the CS2 question bank.

const QuizRace = require("./quizRace");
const { makeQuiz } = require("./buymenuCore");

class BuyMenuGame extends QuizRace {
  constructor(lobbyId, opts = {}) {
    super(lobbyId, opts, makeQuiz);
  }

  static DEFAULT_OPTIONS = QuizRace.DEFAULT_OPTIONS;
  static sanitizeOptions = QuizRace.sanitizeOptions;
}

module.exports = BuyMenuGame;
