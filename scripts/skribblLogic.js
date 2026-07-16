// Skribbl (Draw & Guess) — Server-Authoritative Game Logic

const WORD_LIST = [
  "cat", "dog", "house", "tree", "sun", "moon", "car", "fish", "bird", "flower",
  "mountain", "river", "bridge", "castle", "robot", "dragon", "pizza", "guitar",
  "rocket", "balloon", "rainbow", "dinosaur", "pirate", "ninja", "zombie",
  "snowman", "volcano", "island", "submarine", "helicopter", "umbrella", "spider",
  "butterfly", "elephant", "penguin", "dolphin", "octopus", "unicorn", "wizard",
  "knight", "crown", "treasure", "anchor", "candle", "compass", "diamond",
  "feather", "globe", "hammer", "ladder", "magnet", "parachute", "telescope",
  "waterfall", "windmill", "skeleton", "ghost", "vampire", "witch", "alien",
  "astronaut", "cowboy", "mermaid", "angel", "devil", "clown", "scarecrow",
  // CS2-themed
  "awp", "knife", "smoke grenade", "bomb", "chicken", "hostage", "defuse kit",
  "flashbang", "molotov", "sniper", "headshot", "crosshair", "scope", "silencer",
];

function fuzzyMatch(guess, answer) {
  const g = guess.toLowerCase().trim();
  const a = answer.toLowerCase().trim();
  if (g === a) return 'correct';
  // Check if very close (1 letter difference)
  if (Math.abs(g.length - a.length) <= 1) {
    let diffs = 0;
    const longer = g.length >= a.length ? g : a;
    const shorter = g.length < a.length ? g : a;
    let j = 0;
    for (let i = 0; i < longer.length && j < shorter.length; i++) {
      if (longer[i] !== shorter[j]) {
        diffs++;
        if (g.length !== a.length) continue; // skip char in longer
      }
      j++;
    }
    if (diffs <= 1) return 'close';
  }
  return 'wrong';
}

class SkribblGame {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.status = 'WAITING';
    this.players = [];
    this.scores = {};
    this.currentDrawerIndex = 0;
    this.currentWord = null;
    this.wordChoices = [];
    this.phase = 'CHOOSING'; // CHOOSING, DRAWING, ROUND_END
    this.round = 0;
    this.maxRounds = 3; // Each player draws maxRounds times
    this.drawersThisRound = 0;
    this.guessedPlayers = new Set();
    this.drawingData = []; // Array of draw commands { type, x, y, color, size }
    this.chatMessages = [];
    this.timeLeft = 80;
    this.timerId = null;
    this.logs = [];
    this.hintRevealed = [];
  }

  addPlayer(playerId) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (this.players.includes(playerId)) return false;
    this.players.push(playerId);
    this.scores[playerId] = 0;
    return true;
  }

  removePlayer(playerId) {
    if (this.status !== 'WAITING') return false;
    this.players = this.players.filter(p => p !== playerId);
    delete this.scores[playerId];
    return true;
  }

  start() {
    if (this.players.length < 2) return false;
    this.status = 'PLAYING';
    this.round = 0;
    this.drawersThisRound = 0;
    this.currentDrawerIndex = 0;
    this.scores = {};
    this.players.forEach(p => this.scores[p] = 0);
    this.logs = [];
    this.chatMessages = [];
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

    // Pick 3 word choices
    const shuffled = [...WORD_LIST].sort(() => Math.random() - 0.5);
    this.wordChoices = shuffled.slice(0, 3);

    const drawer = this.players[this.currentDrawerIndex];
    const name = drawer.startsWith('BOT_') ? `Bot ${drawer.slice(-4)}` : drawer.slice(-4);
    this.logs.push({ id: Date.now(), text: `${name} is choosing a word to draw...` });
  }

  chooseWord(playerId, wordIndex) {
    if (this.phase !== 'CHOOSING') return false;
    if (this.players[this.currentDrawerIndex] !== playerId) return false;
    if (wordIndex < 0 || wordIndex >= this.wordChoices.length) return false;

    this.currentWord = this.wordChoices[wordIndex];
    this.phase = 'DRAWING';
    this.timeLeft = 80;
    this.hintRevealed = new Array(this.currentWord.length).fill(false);

    // Reveal a hint at 40s and 20s left
    this._scheduleHints();

    const name = playerId.startsWith('BOT_') ? `Bot ${playerId.slice(-4)}` : playerId.slice(-4);
    this.logs.push({ id: Date.now(), text: `${name} is drawing! Word has ${this.currentWord.length} letters.` });
    return true;
  }

  _scheduleHints() {
    // Reveal ~30% of letters as hints over time
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
    if (!this._hintIndices || this._hintsGiven >= this._hintIndices.length) return;
    this.hintRevealed[this._hintIndices[this._hintsGiven]] = true;
    this._hintsGiven++;
  }

  addDrawData(playerId, data) {
    if (this.phase !== 'DRAWING') return false;
    if (this.players[this.currentDrawerIndex] !== playerId) return false;
    this.drawingData.push(data);
    return true;
  }

  clearCanvas(playerId) {
    if (this.players[this.currentDrawerIndex] !== playerId) return false;
    this.drawingData = [{ type: 'clear' }];
    return true;
  }

  guess(playerId, text) {
    if (this.phase !== 'DRAWING') return false;
    if (this.players[this.currentDrawerIndex] === playerId) return false;
    if (this.guessedPlayers.has(playerId)) return false;

    const result = fuzzyMatch(text, this.currentWord);
    const name = playerId.startsWith('BOT_') ? `Bot ${playerId.slice(-4)}` : playerId.slice(-4);

    if (result === 'correct') {
      this.guessedPlayers.add(playerId);
      // More points for faster guesses
      const pointsBase = 100;
      const timeBonus = Math.floor(this.timeLeft * 2);
      this.scores[playerId] = (this.scores[playerId] || 0) + pointsBase + timeBonus;
      // Drawer also gets points for each correct guess
      const drawerId = this.players[this.currentDrawerIndex];
      this.scores[drawerId] = (this.scores[drawerId] || 0) + 25;

      this.chatMessages.push({ from: name, text: `${name} guessed the word!`, type: 'correct' });

      // Check if everyone guessed
      const nonDrawerPlayers = this.players.filter((_, i) => i !== this.currentDrawerIndex);
      if (nonDrawerPlayers.every(p => this.guessedPlayers.has(p))) {
        this._endDrawerTurn();
      }
      return { result: 'correct' };
    } else if (result === 'close') {
      this.chatMessages.push({ from: name, text, type: 'close' });
      return { result: 'close' };
    } else {
      this.chatMessages.push({ from: name, text, type: 'normal' });
      return { result: 'wrong' };
    }
  }

  tick() {
    if (this.phase !== 'DRAWING') return false;
    this.timeLeft--;
    
    if (this.timeLeft === 40) this.revealHint();
    if (this.timeLeft === 20) this.revealHint();
    
    if (this.timeLeft <= 0) {
      this._endDrawerTurn();
      return true;
    }
    return false;
  }

  _endDrawerTurn() {
    this.phase = 'ROUND_END';
    this.logs.push({ id: Date.now(), text: `The word was "${this.currentWord}"` });
  }

  nextTurn(playerId) {
    if (this.phase !== 'ROUND_END') return false;
    if (this.players[0] !== playerId) return false;
    this._startDrawerTurn();
    return true;
  }

  _endGame() {
    this.status = 'FINISHED';
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const name = sorted[0][0].startsWith('BOT_') ? `Bot ${sorted[0][0].slice(-4)}` : sorted[0][0].slice(-4);
      this.logs.push({ id: Date.now(), text: `🎉 Game over! ${name} wins with ${sorted[0][1]} points!` });
    }
  }

  resetToLobby() {
    this.status = 'WAITING';
    this.drawingData = [];
    this.chatMessages = [];
    this.currentWord = null;
    this.logs = [];
    return true;
  }

  getHint() {
    if (!this.currentWord) return '';
    return this.currentWord.split('').map((ch, i) => {
      if (ch === ' ') return ' ';
      if (this.hintRevealed[i]) return ch;
      return '_';
    }).join('');
  }

  getStateForPlayer(playerId) {
    const isDrawer = this.players[this.currentDrawerIndex] === playerId;
    const hasGuessed = this.guessedPlayers.has(playerId);
    return {
      lobbyId: this.lobbyId,
      status: this.status,
      players: this.players,
      scores: this.scores,
      currentDrawer: this.players[this.currentDrawerIndex],
      isDrawer,
      word: isDrawer ? this.currentWord : null,
      hint: this.getHint(),
      wordChoices: isDrawer && this.phase === 'CHOOSING' ? this.wordChoices : [],
      phase: this.phase,
      round: this.round,
      maxRounds: this.maxRounds,
      drawingData: this.drawingData,
      chatMessages: this.chatMessages.slice(-50),
      timeLeft: this.timeLeft,
      hasGuessed,
      revealedWord: this.phase === 'ROUND_END' ? this.currentWord : null,
      logs: this.logs.slice(-15),
    };
  }
}

module.exports = SkribblGame;
