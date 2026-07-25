// The shared race mode behind HEADSHOT and PENTAKILL.
//
// Both games play the same way in a lobby: everyone works through the *same*
// shuffled run of answers independently, first to the target score wins, total
// guesses breaking ties. Only the pool and the comparison differ, so those
// arrive as `deps` and everything else lives here once.
//
// The solo daily games need none of this — they run entirely in the browser.

const DEFAULT_OPTIONS = {
  targetScore: 5,     // correct identifications needed to win
  roundTimer: 0,      // seconds per answer, 0 = untimed
  revealAfter: 8,     // wrong guesses before the answer is given away
};

const TARGET_SCORES = [3, 5, 10];
const ROUND_TIMERS = [0, 60, 90, 120];

function sanitizeOptions(input) {
  const o = { ...DEFAULT_OPTIONS };
  if (!input || typeof input !== "object") return o;
  if (input.targetScore != null) {
    const n = Math.round(Number(input.targetScore));
    o.targetScore = TARGET_SCORES.includes(n) ? n : DEFAULT_OPTIONS.targetScore;
  }
  if (input.roundTimer != null) {
    const n = Math.round(Number(input.roundTimer));
    o.roundTimer = ROUND_TIMERS.includes(n) ? n : 0;
  }
  if (input.revealAfter != null) {
    o.revealAfter = Math.min(15, Math.max(4, Math.round(Number(input.revealAfter)) || 8));
  }
  return o;
}

/**
 * @param {object} deps
 * @param {() => object[]} deps.pool          every answer that may be guessed
 * @param {(seed, n) => object[]} deps.sequence  a seeded run of answers
 * @param {(q, pool) => object|null} deps.find   resolve a typed name
 * @param {(guess, target) => object} deps.compare
 * @param {(item) => string} [deps.labelOf]   what the event feed calls an answer
 * @param {(item) => object} [deps.chipOf]    how the end screen renders one
 */
class RaceGame {
  constructor(lobbyId, opts = {}, deps) {
    if (!deps) throw new Error("RaceGame needs deps");
    this.deps = deps;
    this.lobbyId = lobbyId;
    this.lang = opts.lang === "fr" ? "fr" : "en";
    this.options = sanitizeOptions(opts.options);

    this.status = "WAITING";
    this.players = [];
    this.meta = {};      // pid -> { isBot, name }
    this.seats = {};     // pid -> { index, score, guesses[], totalGuesses, solved[], done, botAt }
    this.sequence = [];
    this.seed = "";
    this.timeLeft = null;
    this.winner = null;
    this.startedAt = 0;
    this.events = [];
    this.eventSeq = 0;
    this.logs = [];
    this.logSeq = 0;
  }

  _label(item) {
    return this.deps.labelOf ? this.deps.labelOf(item) : item.name;
  }

  _emit(type, data) {
    this.events.push({ seq: ++this.eventSeq, type, at: Date.now(), ...data });
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }

  _log(key, params = {}) {
    this.logs.push({ id: ++this.logSeq, key, ...params });
    if (this.logs.length > 40) this.logs.shift();
  }

  setOptions(options) {
    if (this.status === "PLAYING") return false;
    this.options = sanitizeOptions({ ...this.options, ...options });
    return true;
  }

  addPlayer(playerId, info = {}) {
    if (this.status === "PLAYING") return false;
    if (this.players.includes(playerId)) return false;
    if (this.players.length >= 8) return false;
    this.players.push(playerId);
    this.meta[playerId] = { isBot: !!info.isBot, name: info.name || null };
    return true;
  }

  removePlayer(playerId) {
    const i = this.players.indexOf(playerId);
    if (i === -1) return false;
    this.players.splice(i, 1);
    delete this.meta[playerId];
    delete this.seats[playerId];
    if (this.status === "PLAYING" && this.players.length === 0) this.status = "FINISHED";
    return true;
  }

  start() {
    if (this.players.length < 1) return false;
    // A little headroom past the target; `targetFor` grows it further if someone
    // burns through their run by giving up on answer after answer.
    this.seed = `${this.lobbyId}:${Date.now()}`;
    this.sequence = this.deps.sequence(this.seed, this.options.targetScore + 4);
    if (!this.sequence.length) return false;

    this.status = "PLAYING";
    this.winner = null;
    this.startedAt = Date.now();
    this.logs = [];
    this.events = [];
    this.seats = {};
    for (const p of this.players) {
      this.seats[p] = {
        index: 0, score: 0, guesses: [], totalGuesses: 0, solved: [], done: false,
        botAt: this._botDelay(),
      };
    }
    this.timeLeft = this.options.roundTimer > 0 ? this.options.roundTimer : null;
    this._emit("start", {});
    this._log("start", { n: this.options.targetScore });
    return true;
  }

  _botDelay() { return 4 + Math.floor(Math.random() * 9); }

  targetFor(playerId) {
    const seat = this.seats[playerId];
    if (!seat) return null;
    // Clamping instead of extending would serve the same answer over and over
    // to whoever fell furthest behind, so the run grows to meet them.
    while (seat.index >= this.sequence.length && this._extendSequence()) { /* grow */ }
    return this.sequence[seat.index] || this.sequence[this.sequence.length - 1] || null;
  }

  _extendSequence() {
    const used = new Set(this.sequence.map((p) => p.id));
    const fresh = this.deps.pool().filter((p) => !used.has(p.id));
    if (!fresh.length) return false;
    const batch = this.deps.sequence(`${this.seed}:ext${this.sequence.length}`, 4)
      .filter((p) => !used.has(p.id));
    this.sequence.push(...(batch.length ? batch : fresh.slice(0, 4)));
    return true;
  }

  /**
   * Submit a guess. Returns false if the name isn't in the pool, so the client
   * can tell "unknown" apart from "wrong".
   */
  guess(playerId, nameOrId) {
    if (this.status !== "PLAYING") return false;
    const seat = this.seats[playerId];
    if (!seat || seat.done) return false;

    const pool = this.deps.pool();
    const guessed = pool.find((p) => p.id === nameOrId) || this.deps.find(nameOrId, pool);
    if (!guessed) return false;
    if (seat.guesses.some((g) => g.id === guessed.id)) return false;   // already tried

    const target = this.targetFor(playerId);
    if (!target) return false;

    const result = this.deps.compare(guessed, target);
    seat.guesses.push({ id: guessed.id, name: this._label(guessed), result });
    seat.totalGuesses++;

    if (result.correct) {
      seat.score++;
      seat.solved.push({ id: target.id, name: this._label(target), guesses: seat.guesses.length });
      this._emit("solved", { pid: playerId, score: seat.score });
      this._log("solved", { pid: playerId, word: this._label(target), n: seat.guesses.length });
      this._advance(playerId);
    } else if (seat.guesses.length >= this.options.revealAfter) {
      // Too many misses: show them the answer and move them on, so one hard
      // answer can't strand a player while everyone else races ahead.
      seat.solved.push({ id: target.id, name: this._label(target), guesses: seat.guesses.length, revealed: true });
      this._emit("revealed", { pid: playerId, name: this._label(target) });
      this._log("revealed", { pid: playerId, word: this._label(target) });
      this._advance(playerId);
    }
    return true;
  }

  _advance(playerId) {
    const seat = this.seats[playerId];
    seat.index++;
    seat.guesses = [];
    seat.botAt = this._botDelay();
    if (this.options.roundTimer > 0) this.timeLeft = this.options.roundTimer;

    if (seat.score >= this.options.targetScore) {
      seat.done = true;
      if (!this.winner) {
        this.winner = playerId;
        this._finish();
      }
    }
  }

  _finish() {
    this.status = "FINISHED";
    this.timeLeft = null;
    this._emit("win", { pid: this.winner });
    this._log("win", { pid: this.winner });
  }

  /** One wall-clock second; also paces the bots. Returns true if state moved. */
  tick() {
    if (this.status !== "PLAYING") return false;
    let changed = false;

    for (const p of this.players) {
      if (!this.meta[p].isBot) continue;
      const seat = this.seats[p];
      if (!seat || seat.done) continue;

      seat.botAt--;
      const target = this.targetFor(p);
      if (!target) { seat.botAt = this._botDelay(); continue; }

      if (seat.botAt > 0) {
        // Throw in the occasional wrong name so a rival's guess counter ticks
        // along instead of jumping straight from nothing to solved.
        if (Math.random() < 0.4) {
          const pool = this.deps.pool();
          const wrong = pool[Math.floor(Math.random() * pool.length)];
          if (wrong.id !== target.id && this.guess(p, wrong.id)) changed = true;
        }
        continue;
      }

      if (this.guess(p, target.id)) changed = true;
      else seat.botAt = this._botDelay();
    }

    if (this.timeLeft != null) {
      this.timeLeft--;
      changed = true;
      if (this.timeLeft <= 0) {
        // Out of time on this answer for everyone still going.
        for (const p of this.players) {
          const seat = this.seats[p];
          if (!seat || seat.done) continue;
          const target = this.targetFor(p);
          if (target) {
            seat.solved.push({ id: target.id, name: this._label(target), guesses: seat.guesses.length, revealed: true });
            this._log("timeout", { pid: p, word: this._label(target) });
          }
          this._advance(p);
        }
        this._emit("timeout", {});
      }
    }
    return changed;
  }

  resetToLobby() {
    this.status = "WAITING";
    this.seats = {};
    this.sequence = [];
    this.winner = null;
    this.logs = [];
    this.events = [];
    this.timeLeft = null;
    return true;
  }

  getStateForPlayer(playerId) {
    const seat = this.seats[playerId] || null;
    const finished = this.status === "FINISHED";

    return {
      lobbyId: this.lobbyId,
      lang: this.lang,
      status: this.status,
      options: this.options,
      host: this.players[0],
      targetScore: this.options.targetScore,
      timeLeft: this.timeLeft,
      winner: this.winner,
      // Your own board only — never the answer, unless the race is over.
      me: seat && {
        score: seat.score,
        index: seat.index,
        guesses: seat.guesses,
        solved: seat.solved,
        done: seat.done,
        remaining: Math.max(0, this.options.revealAfter - seat.guesses.length),
      },
      // Opponents show progress, never their board.
      rivals: this.players
        .filter((p) => p !== playerId)
        .map((p) => ({
          steamId: p,
          isBot: this.meta[p].isBot,
          botName: this.meta[p].name,
          score: this.seats[p] ? this.seats[p].score : 0,
          guesses: this.seats[p] ? this.seats[p].guesses.length : 0,
          done: this.seats[p] ? this.seats[p].done : false,
        })),
      standings: finished
        ? this.players
          .map((p) => ({ steamId: p, score: this.seats[p] ? this.seats[p].score : 0, totalGuesses: this.seats[p] ? this.seats[p].totalGuesses : 0 }))
          .sort((a, b) => b.score - a.score || a.totalGuesses - b.totalGuesses)
        : [],
      // The run is only disclosed once nobody can still be racing on it, and
      // only as far as anyone actually got — the tail is unplayed headroom.
      sequence: finished
        ? this.sequence
          .slice(0, Math.max(1, ...this.players.map((p) => (this.seats[p] ? this.seats[p].index : 0))))
          // `chipOf` lets a game add what its end screen renders (a flag, a
          // portrait) without this base knowing anything about it.
          .map((p) => (this.deps.chipOf ? this.deps.chipOf(p) : { id: p.id, name: this._label(p) }))
        : [],
      logs: this.logs.slice(-14),
      events: this.events.slice(-10),
    };
  }

  static DEFAULT_OPTIONS = DEFAULT_OPTIONS;
  static sanitizeOptions = sanitizeOptions;
  static TARGET_SCORES = TARGET_SCORES;
  static ROUND_TIMERS = ROUND_TIMERS;
}

module.exports = RaceGame;
