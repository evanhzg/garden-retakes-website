// CODENAMES — server-authoritative game logic.
//
// Two teams, one spymaster each. The spymaster sees the key card and gives a
// one-word clue plus a number; their operatives tap words until they miss, run
// out of guesses, or stop. Touch the assassin and you lose on the spot.
//
// Everything the host can toggle in the lobby lives in `options` (board size,
// word packs, assassin count, timers, and a few variants). Logs are emitted as
// structured keys so the client can render them in either language, and the
// rolling `events` stream drives the client's sounds and animations.

const { buildPool, categoryLabel, CATEGORIES, PACK_IDS } = require("./codenamesWords");

const DEFAULT_OPTIONS = {
  boardSize: 5,          // 5 → 5x5 / 25 cards, 6 → 6x6 / 36 cards
  packs: { classic: true, cs2: true, gaming: false, party: false },
  assassins: 1,          // 1 or 2 instant-loss cards
  bonusGuess: true,      // the classic "+1 guess" on top of the clue number
  unlimitedGuesses: false, // keep guessing until you miss; the number is a hint only
  zeroClue: true,        // spymasters may say 0 (or ∞) as the count
  doubleAgent: false,    // one card scores for whichever team finds it first
  clueTimer: 0,          // seconds the spymaster gets, 0 = untimed
  turnTimer: 0,          // seconds the operatives get, 0 = untimed
  firstTeam: "random",   // "red" | "blue" | "random"
  revealKey: true,       // show the whole key card once the game ends
};

const CLUE_TIMERS = [0, 45, 60, 90];
const TURN_TIMERS = [0, 60, 90, 120];
const TEAMS = ["red", "blue"];
const other = (team) => (team === "red" ? "blue" : "red");

function sanitizeOptions(input) {
  const o = { ...DEFAULT_OPTIONS, packs: { ...DEFAULT_OPTIONS.packs } };
  if (!input || typeof input !== "object") return o;

  if (input.boardSize != null) o.boardSize = Number(input.boardSize) === 6 ? 6 : 5;
  if (input.packs && typeof input.packs === "object") {
    for (const id of PACK_IDS) if (input.packs[id] != null) o.packs[id] = !!input.packs[id];
    // At least one pack has to stay on or there would be nothing to deal.
    if (!PACK_IDS.some((id) => o.packs[id])) o.packs.classic = true;
  }
  if (input.assassins != null) o.assassins = Math.min(2, Math.max(1, Math.round(Number(input.assassins)) || 1));
  for (const key of ["bonusGuess", "unlimitedGuesses", "zeroClue", "doubleAgent", "revealKey"]) {
    if (input[key] != null) o[key] = !!input[key];
  }
  if (input.clueTimer != null) {
    const n = Math.round(Number(input.clueTimer));
    o.clueTimer = CLUE_TIMERS.includes(n) ? n : 0;
  }
  if (input.turnTimer != null) {
    const n = Math.round(Number(input.turnTimer));
    o.turnTimer = TURN_TIMERS.includes(n) ? n : 0;
  }
  if (input.firstTeam != null) {
    o.firstTeam = TEAMS.includes(input.firstTeam) ? input.firstTeam : "random";
  }
  return o;
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

let logSeq = 0;

class CodenamesGame {
  constructor(lobbyId, opts = {}) {
    this.lobbyId = lobbyId;
    this.lang = opts.lang === "fr" ? "fr" : "en";
    this.options = sanitizeOptions(opts.options);

    this.status = "WAITING"; // WAITING | PLAYING | FINISHED
    this.players = [];       // steamIds, in join order
    this.meta = {};          // steamId -> { isBot, name, team, spymaster }

    this.board = [];
    this.revealed = [];
    this.revealedBy = [];    // which team flipped each card (for the double agent)
    this.currentTeam = "red";
    this.startingTeam = "red";
    this.phase = "CLUE";     // CLUE | GUESS
    this.currentClue = null; // { word, count, unlimited }
    this.clueHistory = [];
    this.guessesLeft = 0;
    this.guessesThisTurn = 0;
    this.timeLeft = null;
    this.winner = null;
    this.winReason = null;
    this.remaining = { red: 0, blue: 0 };
    this.turnNumber = 0;
    this.logs = [];
    this.events = [];
    this.eventSeq = 0;
    // Pending bot action, so the server can pace bots instead of firing
    // everything inside one broadcast.
    this.botCooldown = 0;
  }

  // ---------------------------------------------------------------- plumbing
  _emit(type, data) {
    this.events.push({ seq: ++this.eventSeq, type, at: Date.now(), ...data });
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }

  _log(key, params = {}) {
    this.logs.push({ id: ++logSeq, key, ...params });
    if (this.logs.length > 60) this.logs.shift();
  }

  setOptions(options) {
    if (this.status === "PLAYING") return false;
    this.options = sanitizeOptions({ ...this.options, ...options, packs: { ...this.options.packs, ...(options?.packs || {}) } });
    return true;
  }

  get maxPlayers() { return 12; }

  // ----------------------------------------------------------------- roster
  addPlayer(playerId, info = {}) {
    if (this.status === "PLAYING") return false;
    if (this.players.includes(playerId)) return false;
    if (this.players.length >= this.maxPlayers) return false;

    this.players.push(playerId);
    this.meta[playerId] = {
      isBot: !!info.isBot,
      name: info.name || null,
      // The lobby hands teams over as 0/1; anything else gets balanced below.
      team: info.team === 0 || info.team === "red" ? "red"
        : info.team === 1 || info.team === "blue" ? "blue"
        : null,
      spymaster: !!info.spymaster,
    };
    return true;
  }

  removePlayer(playerId) {
    const idx = this.players.indexOf(playerId);
    if (idx === -1) return false;
    const wasSpymaster = this.meta[playerId]?.spymaster;
    const team = this.meta[playerId]?.team;
    this.players.splice(idx, 1);
    delete this.meta[playerId];

    if (this.status === "PLAYING") {
      // Promote a teammate rather than stranding the team without a key card.
      if (wasSpymaster && team) {
        const heir = this.players.find((p) => this.meta[p].team === team);
        if (heir) {
          this.meta[heir].spymaster = true;
          this._log("newSpymaster", { pid: heir, team });
        }
      }
      if (this.teamOf("red").length === 0 || this.teamOf("blue").length === 0) {
        const survivor = this.teamOf("red").length ? "red" : "blue";
        if (this.teamOf(survivor).length) this._finish(survivor, "forfeit");
        else this.status = "FINISHED";
      }
    }
    return true;
  }

  teamOf(team) { return this.players.filter((p) => this.meta[p]?.team === team); }
  spymasterOf(team) { return this.players.find((p) => this.meta[p]?.team === team && this.meta[p].spymaster) || null; }
  operativesOf(team) { return this.teamOf(team).filter((p) => !this.meta[p].spymaster); }

  /** Host (or the players themselves) moving seats before the game starts. */
  setTeam(playerId, team) {
    if (this.status === "PLAYING") return false;
    const m = this.meta[playerId];
    if (!m || !TEAMS.includes(team)) return false;
    if (m.team === team) return true;
    m.team = team;
    m.spymaster = false;
    return true;
  }

  setSpymaster(playerId) {
    if (this.status === "PLAYING") return false;
    const m = this.meta[playerId];
    if (!m || !m.team) return false;
    for (const p of this.teamOf(m.team)) this.meta[p].spymaster = false;
    m.spymaster = true;
    return true;
  }

  /**
   * Fill in whatever the lobby left unset: balance the teams, then make sure
   * each side has exactly one spymaster.
   */
  _completeRoster() {
    for (const p of this.players) {
      if (this.meta[p].team) continue;
      this.meta[p].team = this.teamOf("red").length <= this.teamOf("blue").length ? "red" : "blue";
    }
    // A colour needs a spymaster *and* someone to guess, so a side left with
    // fewer than two players borrows from the other one. Without this a lone
    // spymaster would give clues nobody on their team could ever answer.
    for (const team of TEAMS) {
      while (this.teamOf(team).length < 2 && this.teamOf(other(team)).length > 2) {
        const donor = this.teamOf(other(team)).slice(-1)[0];
        this.meta[donor].team = team;
        this.meta[donor].spymaster = false;
      }
    }
    for (const team of TEAMS) {
      const roster = this.teamOf(team);
      if (!roster.length) continue;
      const masters = roster.filter((p) => this.meta[p].spymaster);
      if (masters.length === 1) continue;
      roster.forEach((p) => { this.meta[p].spymaster = false; });
      // Prefer a human — being the spymaster is the interesting seat.
      const pick = roster.find((p) => !this.meta[p].isBot) || roster[0];
      this.meta[pick].spymaster = true;
    }
  }

  // ------------------------------------------------------------------ setup
  start() {
    if (this.players.length < 2) return false;
    this._completeRoster();
    if (!this.teamOf("red").length || !this.teamOf("blue").length) return false;

    this.status = "PLAYING";
    this.winner = null;
    this.winReason = null;
    this.logs = [];
    this.events = [];
    this.clueHistory = [];
    this.turnNumber = 0;

    this.startingTeam = TEAMS.includes(this.options.firstTeam)
      ? this.options.firstTeam
      : TEAMS[Math.floor(Math.random() * 2)];
    this.currentTeam = this.startingTeam;

    if (!this._generateBoard()) { this.status = "WAITING"; return false; }

    this.phase = "CLUE";
    this.currentClue = null;
    this.guessesLeft = 0;
    this._startClock();
    this._log("start", { team: this.currentTeam });
    this._emit("start", { team: this.currentTeam });
    return true;
  }

  _generateBoard() {
    const size = this.options.boardSize;
    const cells = size * size;
    const pool = buildPool(this.lang, this.options.packs);
    if (pool.length < cells) return false;

    const words = shuffle(pool).slice(0, cells);

    // The team that starts gets one extra agent; the assassin count and the
    // optional double agent eat into the neutral bystanders.
    const firstCount = size === 6 ? 12 : 9;
    const secondCount = firstCount - 1;
    const types = [];
    for (let i = 0; i < firstCount; i++) types.push(this.startingTeam);
    for (let i = 0; i < secondCount; i++) types.push(other(this.startingTeam));
    for (let i = 0; i < this.options.assassins; i++) types.push("assassin");
    if (this.options.doubleAgent) types.push("double");
    while (types.length < cells) types.push("neutral");

    const shuffledTypes = shuffle(types);
    this.board = words.map((w, i) => ({ id: i, word: w.word, cat: w.cat, type: shuffledTypes[i] }));
    this.revealed = new Array(cells).fill(false);
    this.revealedBy = new Array(cells).fill(null);
    this.remaining = { red: 0, blue: 0 };
    for (const card of this.board) {
      if (card.type === "red") this.remaining.red++;
      if (card.type === "blue") this.remaining.blue++;
    }
    // The double agent is worth one card to whoever gets there first, so both
    // teams' targets go up by one.
    if (this.options.doubleAgent) { this.remaining.red++; this.remaining.blue++; }
    return true;
  }

  _startClock() {
    const secs = this.phase === "CLUE" ? this.options.clueTimer : this.options.turnTimer;
    this.timeLeft = secs > 0 ? secs : null;
  }

  // ------------------------------------------------------------------ clues
  giveClue(playerId, word, count) {
    if (this.status !== "PLAYING" || this.phase !== "CLUE") return false;
    if (this.spymasterOf(this.currentTeam) !== playerId) return false;

    const clean = String(word || "").trim().replace(/\s+/g, " ").slice(0, 24);
    if (!clean || /\s/.test(clean)) return false;          // exactly one word
    if (!/[\p{L}\p{N}]/u.test(clean)) return false;

    // A clue may not be a word sitting on the board (revealed or not).
    const normal = this._normalize(clean);
    if (this.board.some((c) => this._normalize(c.word) === normal)) return false;

    let n = Math.round(Number(count));
    if (!Number.isFinite(n)) n = 1;
    const unlimited = n === 0 && this.options.zeroClue;
    n = Math.min(this.options.boardSize === 6 ? 12 : 9, Math.max(this.options.zeroClue ? 0 : 1, n));

    this.currentClue = { word: clean.toUpperCase(), count: n, unlimited };
    this.clueHistory.push({ team: this.currentTeam, word: clean.toUpperCase(), count: n, unlimited });
    this.guessesLeft = unlimited || this.options.unlimitedGuesses
      ? Infinity
      : n + (this.options.bonusGuess ? 1 : 0);
    this.guessesThisTurn = 0;
    this.phase = "GUESS";
    this._startClock();

    this._log("clue", { team: this.currentTeam, pid: playerId, word: this.currentClue.word, count: n, unlimited });
    this._emit("clue", { team: this.currentTeam, unlimited });
    this.botCooldown = 2;
    return true;
  }

  /** Accent- and punctuation-insensitive, so "FUMIGÈNE" ≡ "fumigene". */
  _normalize(s) {
    return String(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase();
  }

  // ----------------------------------------------------------------- guesses
  guess(playerId, cardIndex) {
    if (this.status !== "PLAYING" || this.phase !== "GUESS") return false;
    const team = this.currentTeam;
    const m = this.meta[playerId];
    if (!m || m.team !== team || m.spymaster) return false;
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= this.board.length) return false;
    if (this.revealed[cardIndex]) return false;

    this.revealed[cardIndex] = true;
    this.revealedBy[cardIndex] = team;
    this.guessesThisTurn++;
    const card = this.board[cardIndex];
    const kind = card.type === "double" ? team : card.type;

    this._log("pick", { team, pid: playerId, word: card.word, kind });
    this._emit("reveal", { index: cardIndex, kind, team, correct: kind === team });

    if (card.type === "assassin") {
      this._finish(other(team), "assassin");
      return true;
    }

    if (kind === "red") this.remaining.red--;
    if (kind === "blue") this.remaining.blue--;
    if (card.type === "double") {
      // Found by one team, so it stops counting towards the other's target.
      this.remaining[other(team)]--;
      this._log("double", { team, pid: playerId });
      this._emit("double", { team });
    }

    if (this.remaining.red <= 0) { this._finish("red", "agents"); return true; }
    if (this.remaining.blue <= 0) { this._finish("blue", "agents"); return true; }

    if (kind !== team) { this._endTurn("miss"); return true; }

    if (this.guessesLeft !== Infinity) {
      this.guessesLeft--;
      if (this.guessesLeft <= 0) { this._endTurn("outOfGuesses"); return true; }
    }
    this.botCooldown = 2;
    return true;
  }

  endGuessing(playerId) {
    if (this.status !== "PLAYING" || this.phase !== "GUESS") return false;
    const m = this.meta[playerId];
    if (!m || m.team !== this.currentTeam || m.spymaster) return false;
    // Same as at the table: a clue has to be answered with at least one guess
    // before the team is allowed to pass.
    if (this.guessesThisTurn === 0) return false;
    this._endTurn("stopped");
    return true;
  }

  _endTurn(reason) {
    this.currentTeam = other(this.currentTeam);
    this.phase = "CLUE";
    this.currentClue = null;
    this.guessesLeft = 0;
    this.guessesThisTurn = 0;
    this.turnNumber++;
    this._startClock();
    this._log("endTurn", { team: this.currentTeam, reason });
    this._emit("turn", { team: this.currentTeam, reason });
    this.botCooldown = 2;
  }

  _finish(winner, reason) {
    this.winner = winner;
    this.winReason = reason;
    this.status = "FINISHED";
    this.phase = "CLUE";
    this.timeLeft = null;
    this._log("win", { team: winner, reason });
    this._emit(reason === "assassin" ? "assassin" : "win", { team: winner, reason });
  }

  /** One wall-clock second. Returns true when something changed. */
  tick() {
    if (this.status !== "PLAYING") return false;
    if (this.botCooldown > 0) this.botCooldown--;

    // Someone left mid-turn and took the last operative with them — the clue
    // can never be answered, so hand play back rather than stalling the table.
    if (this.phase === "GUESS" && this.operativesOf(this.currentTeam).length === 0) {
      this._endTurn("stopped");
      return true;
    }

    if (this.timeLeft == null) return false;

    this.timeLeft--;
    if (this.timeLeft > 0) return this.timeLeft <= 5; // last five seconds are worth a redraw
    if (this.phase === "CLUE") {
      this._log("clueTimeout", { team: this.currentTeam });
      this._emit("timeout", { team: this.currentTeam, phase: "CLUE" });
      this._endTurn("timeout");
    } else {
      this._emit("timeout", { team: this.currentTeam, phase: "GUESS" });
      this._endTurn("timeout");
    }
    return true;
  }

  // -------------------------------------------------------------------- bots
  /**
   * Bot spymasters cluster their remaining words by the category tags in the
   * word bank and name the biggest safe cluster; bot operatives read the clue
   * back through the same map. It plays like a cautious human and never needs
   * a word-embedding model.
   */
  _bestCategory(team) {
    const buckets = new Map();
    this.board.forEach((card, i) => {
      if (this.revealed[i]) return;
      const b = buckets.get(card.cat) || { own: 0, foe: 0, neutral: 0, assassin: 0 };
      if (card.type === team || card.type === "double") b.own++;
      else if (card.type === "assassin") b.assassin++;
      else if (card.type === "neutral") b.neutral++;
      else b.foe++;
      buckets.set(card.cat, b);
    });

    let best = null;
    for (const [cat, b] of buckets) {
      if (b.own === 0) continue;
      const score = b.own * 3 - b.foe * 2 - b.assassin * 8 - b.neutral;
      if (!best || score > best.score) best = { cat, score, own: b.own };
    }
    return best;
  }

  botGiveClue(playerId) {
    if (this.status !== "PLAYING" || this.phase !== "CLUE") return false;
    if (this.spymasterOf(this.currentTeam) !== playerId) return false;

    const best = this._bestCategory(this.currentTeam);
    let word = best ? categoryLabel(best.cat, this.lang) : null;
    let count = best ? Math.min(4, best.own) : 1;

    // Fall back to any category label that isn't sitting on the board.
    if (!word || this.board.some((c) => this._normalize(c.word) === this._normalize(word))) {
      const options = Object.keys(CATEGORIES)
        .map((c) => categoryLabel(c, this.lang))
        .filter((w) => !this.board.some((c) => this._normalize(c.word) === this._normalize(w)));
      word = options[Math.floor(Math.random() * options.length)] || "AGENT";
      count = 1;
    }
    return this.giveClue(playerId, word, count);
  }

  botGuess(playerId) {
    if (this.status !== "PLAYING" || this.phase !== "GUESS") return false;
    const m = this.meta[playerId];
    if (!m || m.team !== this.currentTeam || m.spymaster) return false;

    const unrevealed = this.board
      .map((card, i) => ({ card, i }))
      .filter(({ i }) => !this.revealed[i]);
    if (!unrevealed.length) return false;

    // Which category does the clue name?
    const clue = this.currentClue ? this._normalize(this.currentClue.word) : "";
    const cat = Object.keys(CATEGORIES).find((c) => this._normalize(categoryLabel(c, this.lang)) === clue);

    let candidates = cat ? unrevealed.filter(({ card }) => card.cat === cat) : [];
    // Even on-topic, a bot misreads roughly one guess in six.
    if (!candidates.length || Math.random() < 0.16) candidates = unrevealed;

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return this.guess(playerId, pick.i);
  }

  /**
   * Whoever the table is waiting on, if it's a bot. The server calls this on a
   * timer so bots visibly "think" instead of resolving a whole turn instantly.
   */
  pendingBot() {
    if (this.status !== "PLAYING" || this.botCooldown > 0) return null;
    if (this.phase === "CLUE") {
      const sm = this.spymasterOf(this.currentTeam);
      return sm && this.meta[sm].isBot ? { playerId: sm, action: "clue" } : null;
    }
    const ops = this.operativesOf(this.currentTeam);
    if (!ops.length) return null;
    // With no human operative the bots run the turn; otherwise humans lead and
    // bots only step in once the clock is nearly out.
    const humans = ops.filter((p) => !this.meta[p].isBot);
    if (humans.length && !(this.timeLeft != null && this.timeLeft <= 5)) return null;
    const bot = ops.find((p) => this.meta[p].isBot);
    return bot ? { playerId: bot, action: "guess" } : null;
  }

  // ------------------------------------------------------------------ misc
  resetToLobby() {
    this.status = "WAITING";
    this.board = [];
    this.revealed = [];
    this.revealedBy = [];
    this.winner = null;
    this.winReason = null;
    this.currentClue = null;
    this.clueHistory = [];
    this.logs = [];
    this.events = [];
    this.timeLeft = null;
    return true;
  }

  getStateForPlayer(playerId) {
    const m = this.meta[playerId];
    const isSpymaster = !!m?.spymaster;
    const showKey = isSpymaster || (this.status === "FINISHED" && this.options.revealKey);

    return {
      lobbyId: this.lobbyId,
      lang: this.lang,
      status: this.status,
      options: this.options,
      board: this.board.map((card, i) => ({
        id: card.id,
        word: card.word,
        // Everyone sees a revealed card's colour; only spymasters (and, once
        // it's over, the table) see the rest of the key.
        type: this.revealed[i] || showKey ? card.type : "hidden",
        revealedBy: this.revealedBy[i],
      })),
      revealed: this.revealed,
      boardSize: this.options.boardSize,
      players: this.players,
      roster: this.players.map((p) => ({
        steamId: p,
        team: this.meta[p].team,
        spymaster: this.meta[p].spymaster,
        isBot: this.meta[p].isBot,
        botName: this.meta[p].name,
      })),
      me: {
        team: m?.team ?? null,
        spymaster: isSpymaster,
        isMyTurn: m?.team === this.currentTeam,
        canClue: m?.team === this.currentTeam && isSpymaster && this.phase === "CLUE",
        canGuess: m?.team === this.currentTeam && !isSpymaster && this.phase === "GUESS",
      },
      host: this.players[0],
      currentTeam: this.currentTeam,
      startingTeam: this.startingTeam,
      phase: this.phase,
      currentClue: this.currentClue,
      clueHistory: this.clueHistory.slice(-12),
      guessesLeft: this.guessesLeft === Infinity ? null : this.guessesLeft,
      guessesThisTurn: this.guessesThisTurn,
      timeLeft: this.timeLeft,
      turnTotal: this.phase === "CLUE" ? this.options.clueTimer : this.options.turnTimer,
      winner: this.winner,
      winReason: this.winReason,
      remaining: this.remaining,
      logs: this.logs.slice(-24),
      events: this.events.slice(-10),
    };
  }

  static DEFAULT_OPTIONS = DEFAULT_OPTIONS;
  static sanitizeOptions = sanitizeOptions;
  static CLUE_TIMERS = CLUE_TIMERS;
  static TURN_TIMERS = TURN_TIMERS;
}

module.exports = CodenamesGame;
