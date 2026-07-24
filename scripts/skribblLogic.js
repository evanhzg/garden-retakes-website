// Skribbl (Draw & Guess) — server-authoritative game logic.
//
// The lobby's language decides which word bank the drawer picks from; the
// client separately decides which language the UI chrome is in.

const { wordsFor, normalize } = require('./skribblWords');

const DRAW_SECONDS = 80;
const ROUND_END_SECONDS = 6;
const CHOOSE_SECONDS = 15;

/** Levenshtein distance, capped — we only care about "within one edit". */
function editDistance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

function fuzzyMatch(guess, answer) {
  const g = normalize(guess);
  const a = normalize(answer);
  if (!g) return 'wrong';
  if (g === a) return 'correct';
  if (a.length >= 4 && editDistance(g, a) <= 1) return 'close';
  return 'wrong';
}

class SkribblGame {
  constructor(lobbyId, lang = 'en') {
    this.lobbyId = lobbyId;
    this.lang = lang === 'fr' ? 'fr' : 'en';
    this.status = 'WAITING';
    this.players = [];
    this.scores = {};
    this.currentDrawerIndex = 0;
    this.currentWord = null;
    this.wordChoices = [];
    this.phase = 'CHOOSING'; // CHOOSING, DRAWING, ROUND_END
    this.round = 0;
    this.maxRounds = 3; // each player draws once per round
    this.drawersThisRound = 0;
    this.guessedPlayers = new Set();
    this.drawingData = [];
    this.chatMessages = [];
    this.timeLeft = DRAW_SECONDS;
    this.roundEndIn = 0;
    this.chooseIn = CHOOSE_SECONDS;
    this.logs = [];
    this.hintRevealed = [];
    this.turnScores = {};   // points earned this turn, for the end-of-turn card
    this.events = [];
    this.eventSeq = 0;
    this.recentWords = [];  // avoid repeating the same word inside a game
  }

  _emit(type, data) {
    this.events.push({ seq: ++this.eventSeq, type, at: Date.now(), ...data });
    if (this.events.length > 30) this.events.splice(0, this.events.length - 30);
  }

  addPlayer(playerId) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (this.players.includes(playerId)) return false;
    this.players.push(playerId);
    this.scores[playerId] = 0;
    return true;
  }

  removePlayer(playerId) {
    const wasDrawer = this.players[this.currentDrawerIndex] === playerId;
    const idx = this.players.indexOf(playerId);
    if (idx === -1) return false;
    this.players.splice(idx, 1);
    delete this.scores[playerId];
    this.guessedPlayers.delete(playerId);
    if (this.status === 'PLAYING') {
      if (this.players.length < 2) { this._endGame(); return true; }
      if (idx < this.currentDrawerIndex) this.currentDrawerIndex--;
      if (wasDrawer && this.phase !== 'ROUND_END') this._endDrawerTurn();
    }
    return true;
  }

  setRounds(n) {
    if (this.status === 'PLAYING') return false;
    this.maxRounds = Math.min(8, Math.max(1, Math.round(Number(n)) || 3));
    return true;
  }

  start() {
    if (this.players.length < 2) return false;
    this.status = 'PLAYING';
    this.round = 0;
    this.drawersThisRound = 0;
    this.currentDrawerIndex = 0;
    this.scores = {};
    this.players.forEach(p => { this.scores[p] = 0; });
    this.logs = [];
    this.chatMessages = [];
    this.recentWords = [];
    this._startDrawerTurn();
    return true;
  }

  _startDrawerTurn() {
    if (this.drawersThisRound >= this.players.length) {
      this.round++;
      this.drawersThisRound = 0;
      if (this.round >= this.maxRounds) {
        this._endGame();
        return;
      }
    }

    this.currentDrawerIndex = this.drawersThisRound;
    this.drawersThisRound++;
    this.phase = 'CHOOSING';
    this.currentWord = null;
    this.drawingData = [];
    this.guessedPlayers = new Set();
    this.hintRevealed = [];
    this.turnScores = {};
    this.roundEndIn = 0;
    this.chooseIn = CHOOSE_SECONDS;
    this.timeLeft = DRAW_SECONDS;

    const bank = wordsFor(this.lang).filter(w => !this.recentWords.includes(w));
    const pool = bank.length >= 3 ? bank : wordsFor(this.lang).slice();
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    this.wordChoices = shuffled.slice(0, 3);

    this.logs.push({ id: Date.now(), key: 'choosing', pid: this.players[this.currentDrawerIndex] });
    this._emit('turn_start', { pid: this.players[this.currentDrawerIndex] });
  }

  chooseWord(playerId, wordIndex) {
    if (this.phase !== 'CHOOSING') return false;
    if (this.players[this.currentDrawerIndex] !== playerId) return false;
    const idx = Number(wordIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.wordChoices.length) return false;

    this.currentWord = this.wordChoices[idx];
    this.recentWords.push(this.currentWord);
    if (this.recentWords.length > 30) this.recentWords.shift();
    this.phase = 'DRAWING';
    this.timeLeft = DRAW_SECONDS;
    this.hintRevealed = new Array(this.currentWord.length).fill(false);
    this._scheduleHints();

    this.logs.push({ id: Date.now(), key: 'drawing', pid: playerId, length: this.currentWord.length });
    this._emit('word_chosen', { pid: playerId });
    return true;
  }

  _scheduleHints() {
    const totalToReveal = Math.max(1, Math.floor(this.currentWord.length * 0.3));
    const indices = [];
    for (let i = 0; i < this.currentWord.length; i++) {
      if (this.currentWord[i] !== ' ') indices.push(i);
    }
    indices.sort(() => Math.random() - 0.5);
    this._hintIndices = indices.slice(0, totalToReveal);
    this._hintsGiven = 0;
  }

  revealHint() {
    if (!this._hintIndices || this._hintsGiven >= this._hintIndices.length) return false;
    this.hintRevealed[this._hintIndices[this._hintsGiven]] = true;
    this._hintsGiven++;
    this._emit('hint', {});
    return true;
  }

  addDrawData(playerId, data) {
    if (this.phase !== 'DRAWING') return false;
    if (this.players[this.currentDrawerIndex] !== playerId) return false;
    if (!data || (data.type !== 'line' && data.type !== 'fill' && data.type !== 'clear')) return false;
    this.drawingData.push(data);
    if (this.drawingData.length > 8000) this.drawingData.shift();
    return true;
  }

  clearCanvas(playerId) {
    if (this.players[this.currentDrawerIndex] !== playerId) return false;
    this.drawingData = [{ type: 'clear' }];
    return true;
  }

  undo(playerId) {
    if (this.phase !== 'DRAWING') return false;
    if (this.players[this.currentDrawerIndex] !== playerId) return false;
    // Strokes are tagged with a stroke id by the client; drop the last one.
    const last = this.drawingData[this.drawingData.length - 1];
    if (!last || last.stroke == null) return false;
    const id = last.stroke;
    while (this.drawingData.length && this.drawingData[this.drawingData.length - 1].stroke === id) {
      this.drawingData.pop();
    }
    return true;
  }

  guess(playerId, text) {
    if (this.phase !== 'DRAWING') return { result: 'ignored' };
    if (this.players[this.currentDrawerIndex] === playerId) return { result: 'ignored' };
    if (this.guessedPlayers.has(playerId)) return { result: 'ignored' };
    const raw = String(text || '').slice(0, 60);
    if (!raw.trim()) return { result: 'ignored' };

    const result = fuzzyMatch(raw, this.currentWord);

    if (result === 'correct') {
      this.guessedPlayers.add(playerId);
      // Faster guesses and later places are worth less.
      const place = this.guessedPlayers.size;
      const points = Math.max(40, Math.round((100 + this.timeLeft * 2) / place));
      this.scores[playerId] = (this.scores[playerId] || 0) + points;
      this.turnScores[playerId] = (this.turnScores[playerId] || 0) + points;

      const drawerId = this.players[this.currentDrawerIndex];
      const drawerPoints = 25;
      this.scores[drawerId] = (this.scores[drawerId] || 0) + drawerPoints;
      this.turnScores[drawerId] = (this.turnScores[drawerId] || 0) + drawerPoints;

      this.chatMessages.push({ pid: playerId, type: 'correct', place, points, at: Date.now() });
      this._emit('correct', { pid: playerId, place, points });

      const guessers = this.players.filter((_, i) => i !== this.currentDrawerIndex);
      if (guessers.every(p => this.guessedPlayers.has(p))) this._endDrawerTurn();
      return { result: 'correct', points };
    }

    if (result === 'close') {
      this.chatMessages.push({ pid: playerId, text: raw, type: 'close', at: Date.now() });
      this._emit('close', { pid: playerId });
      return { result: 'close' };
    }

    this.chatMessages.push({ pid: playerId, text: raw, type: 'normal', at: Date.now() });
    if (this.chatMessages.length > 120) this.chatMessages.shift();
    return { result: 'wrong' };
  }

  /** One second of wall clock. Returns true when the turn/game just advanced. */
  tick() {
    if (this.status !== 'PLAYING') return false;

    if (this.phase === 'ROUND_END') {
      this.roundEndIn--;
      if (this.roundEndIn <= 0) {
        this._startDrawerTurn();
        return true;
      }
      return false;
    }

    // Nobody waits forever on an indecisive drawer.
    if (this.phase === 'CHOOSING') {
      this.chooseIn--;
      if (this.chooseIn <= 0) {
        const drawer = this.players[this.currentDrawerIndex];
        this.chooseWord(drawer, Math.floor(Math.random() * this.wordChoices.length));
        return true;
      }
      return false;
    }

    if (this.phase !== 'DRAWING') return false;

    this.timeLeft--;
    if (this.timeLeft === 40 || this.timeLeft === 20) this.revealHint();
    if (this.timeLeft === 10) this._emit('hurry', {});

    if (this.timeLeft <= 0) {
      this._endDrawerTurn();
      return true;
    }
    return false;
  }

  _endDrawerTurn() {
    this.phase = 'ROUND_END';
    this.roundEndIn = ROUND_END_SECONDS;
    this.logs.push({ id: Date.now(), key: 'wordWas', word: this.currentWord });
    this._emit('turn_end', { word: this.currentWord });
  }

  /** Host can cut the between-turns pause short. */
  nextTurn(playerId) {
    if (this.phase !== 'ROUND_END') return false;
    if (this.players[0] !== playerId) return false;
    if (this.status === 'FINISHED') return false;
    this._startDrawerTurn();
    return true;
  }

  _endGame() {
    this.status = 'FINISHED';
    this.phase = 'ROUND_END';
    this.roundEndIn = 0;
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      this.logs.push({ id: Date.now(), key: 'gameOver', pid: sorted[0][0], score: sorted[0][1] });
      this._emit('game_over', { pid: sorted[0][0] });
    }
  }

  resetToLobby() {
    this.status = 'WAITING';
    this.phase = 'CHOOSING';
    this.drawingData = [];
    this.chatMessages = [];
    this.currentWord = null;
    this.logs = [];
    this.events = [];
    return true;
  }

  getHint() {
    if (!this.currentWord) return '';
    return this.currentWord.split('').map((ch, i) => {
      if (ch === ' ' || ch === '-') return ch;
      return this.hintRevealed[i] ? ch : '_';
    }).join('');
  }

  getStateForPlayer(playerId) {
    const isDrawer = this.players[this.currentDrawerIndex] === playerId;
    const hasGuessed = this.guessedPlayers.has(playerId);
    const revealTo = isDrawer || hasGuessed || this.phase === 'ROUND_END';
    return {
      lobbyId: this.lobbyId,
      lang: this.lang,
      status: this.status,
      players: this.players,
      host: this.players[0],
      scores: this.scores,
      turnScores: this.turnScores,
      currentDrawer: this.players[this.currentDrawerIndex],
      isDrawer,
      // Guessers who already got it can see the word too, so they can follow along.
      word: revealTo ? this.currentWord : null,
      hint: this.getHint(),
      wordChoices: isDrawer && this.phase === 'CHOOSING' ? this.wordChoices : [],
      phase: this.phase,
      round: this.round,
      maxRounds: this.maxRounds,
      drawingData: this.drawingData,
      chatMessages: this.chatMessages.slice(-60),
      guessed: Array.from(this.guessedPlayers),
      timeLeft: this.timeLeft,
      roundEndIn: this.roundEndIn,
      chooseIn: this.chooseIn,
      hasGuessed,
      revealedWord: this.phase === 'ROUND_END' ? this.currentWord : null,
      logs: this.logs.slice(-15),
      events: this.events.slice(-10),
    };
  }
}

module.exports = SkribblGame;
