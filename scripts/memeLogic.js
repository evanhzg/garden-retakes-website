// Make It Meme — server-authoritative game logic.
//
// Two answer modes:
//   caption : players write text into a meme template's slots.
//   gif     : players answer a text prompt with a reaction GIF.
// Phases (CAPTION → VOTE → RESULTS) advance when everyone has acted or a
// server-side timer runs out. Everything the client animates/plays is emitted
// on the event stream.

const { TEMPLATES, GIF_PROMPTS, GIF_LIBRARY, PACKS } = require("./memeContent");

const DEFAULT_OPTIONS = {
  rounds: 5,
  captionSeconds: 60,
  voteSeconds: 30,
  mode: "caption", // 'caption' | 'gif'
  packs: { classic: true, cs2: true, wholesome: false, chaos: false, gif: false },
};

const RESULTS_SECONDS = 8;

const BOT_CAPTIONS = {
  en: [
    "When the server admin is AFK", "Me pretending to be good at CS2",
    "The teammate who rushes B every round", "My aim vs my confidence",
    "Solo queue in a nutshell", "When you finally hit Global",
    "That one guy who never buys armor", "When the last update breaks everything",
    "My K/D after a 10-game losing streak", "When you hear footsteps behind you",
    "The AWPer who misses every shot", "My economy after force-buying every round",
    "Bomb planted, no kit, big brain time", "I'll just play one more game",
    "The callouts vs reality", "1v5 clutch nobody was watching",
    "Nobody: / Me at 3am:", "Certified moment", "It's not much but it's honest work",
    "This is fine",
  ],
  fr: [
    "Quand l'admin du serveur est AFK", "Moi qui fais semblant d'être bon à CS2",
    "Le coéquipier qui rush B chaque round", "Mon aim vs ma confiance",
    "Le solo queue résumé", "Quand tu touches enfin Global",
    "Le mec qui n'achète jamais d'armure", "Quand la dernière maj casse tout",
    "Mon ratio après 10 défaites d'affilée", "Quand tu entends des pas derrière toi",
    "L'AWP qui rate tous ses tirs", "Mon éco après un force-buy chaque round",
    "Bombe posée, pas de kit, gros cerveau", "Encore une petite dernière",
    "Les appels vs la réalité", "Clutch 1v5 que personne ne regardait",
    "Personne : / Moi à 3h du mat :", "Moment certifié", "C'est pas grand-chose mais c'est honnête",
    "Tout va bien",
  ],
};

function sanitizeOptions(input) {
  const o = { ...DEFAULT_OPTIONS, packs: { ...DEFAULT_OPTIONS.packs } };
  if (!input || typeof input !== "object") return o;
  if (input.rounds != null) o.rounds = Math.min(10, Math.max(1, Math.round(Number(input.rounds)) || 5));
  if (input.captionSeconds != null) o.captionSeconds = Math.min(180, Math.max(20, Math.round(Number(input.captionSeconds)) || 60));
  if (input.voteSeconds != null) o.voteSeconds = Math.min(90, Math.max(10, Math.round(Number(input.voteSeconds)) || 30));
  if (input.mode === "gif" || input.mode === "caption") o.mode = input.mode;
  if (input.packs && typeof input.packs === "object") {
    for (const p of PACKS) if (input.packs[p] != null) o.packs[p] = !!input.packs[p];
  }
  return o;
}

// Custom imports: only http(s) or data image URLs, capped and length-limited.
function sanitizeCustomTemplates(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list.slice(0, 40)) {
    const url = typeof t === "string" ? t : t && t.url;
    if (typeof url !== "string") continue;
    if (url.length > 400) continue;
    if (!/^(https?:\/\/|data:image\/)/i.test(url)) continue;
    const name = (t && typeof t.name === "string" ? t.name : "Custom").slice(0, 40);
    const slots = Array.isArray(t && t.slots) && t.slots.length
      ? t.slots.slice(0, 4).map((s) => ({ x: clampPct(s.x, 50), y: clampPct(s.y, 90), w: clampPct(s.w, 92), dark: !!s.dark }))
      : [{ x: 50, y: 10, w: 92 }, { x: 50, y: 90, w: 92 }];
    out.push({ id: "custom-" + out.length, name, url, pack: "custom", animated: /\.gif($|\?)/i.test(url), slots, custom: true });
  }
  return out;
}

function clampPct(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

let seq = 0;

class MemeGame {
  constructor(lobbyId, opts = {}) {
    this.lobbyId = lobbyId;
    this.lang = opts.lang === "fr" ? "fr" : "en";
    this.options = sanitizeOptions(opts.options);
    this.customTemplates = sanitizeCustomTemplates(opts.customTemplates);

    this.status = "WAITING";
    this.players = [];
    this.scores = {};
    this.round = 0;
    this.phase = "CAPTION"; // CAPTION | VOTE | RESULTS
    this.currentTemplate = null; // caption mode
    this.currentPrompt = null;   // gif mode
    this.submissions = {};       // pid -> { captions } | { gif }
    this.votes = {};             // voterId -> targetId
    this.roundResults = [];
    this.logs = [];
    this.pool = [];
    this.timeLeft = 0;
    this.events = [];
    this.eventSeq = 0;
  }

  get maxRounds() { return this.options.rounds; }

  _emit(type, data) {
    this.events.push({ seq: ++this.eventSeq, type, at: Date.now(), ...data });
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }

  setOptions(options, customTemplates) {
    if (this.status === "PLAYING") return false;
    if (options) this.options = sanitizeOptions({ ...this.options, ...options, packs: { ...this.options.packs, ...(options.packs || {}) } });
    if (customTemplates) this.customTemplates = sanitizeCustomTemplates(customTemplates);
    return true;
  }

  addPlayer(playerId) {
    if (this.status !== "WAITING" || this.players.length >= 8) return false;
    if (this.players.includes(playerId)) return false;
    this.players.push(playerId);
    this.scores[playerId] = 0;
    return true;
  }

  removePlayer(playerId) {
    const idx = this.players.indexOf(playerId);
    if (idx === -1) return false;
    this.players.splice(idx, 1);
    delete this.scores[playerId];
    delete this.submissions[playerId];
    delete this.votes[playerId];
    if (this.status === "PLAYING" && this.players.length < 2) { this._endGame(); return true; }
    if (this.status === "PLAYING") this._maybeAdvance();
    return true;
  }

  _buildPool() {
    if (this.options.mode === "gif") {
      const prompts = GIF_PROMPTS[this.lang] || GIF_PROMPTS.en;
      this.pool = prompts.slice().sort(() => Math.random() - 0.5);
      return;
    }
    const enabled = new Set(PACKS.filter((p) => this.options.packs[p]));
    let templates = TEMPLATES.filter((t) => enabled.has(t.pack));
    templates = templates.concat(this.customTemplates);
    if (templates.length === 0) templates = TEMPLATES.filter((t) => t.pack === "classic");
    this.pool = templates.sort(() => Math.random() - 0.5);
  }

  start() {
    if (this.players.length < 2) return false;
    this.status = "PLAYING";
    this.round = 0;
    this.scores = {};
    this.players.forEach((p) => { this.scores[p] = 0; });
    this.logs = [];
    this.events = [];
    this._buildPool();
    this._startRound();
    return true;
  }

  _startRound() {
    this.round++;
    if (this.round > this.maxRounds) { this._endGame(); return; }

    this.submissions = {};
    this.votes = {};
    this.roundResults = [];
    this.phase = "CAPTION";
    this.timeLeft = this.options.captionSeconds;

    if (this.options.mode === "gif") {
      if (this.pool.length === 0) this._buildPool();
      this.currentPrompt = this.pool.pop();
      this.currentTemplate = null;
    } else {
      if (this.pool.length === 0) this._buildPool();
      this.currentTemplate = this.pool.pop();
      this.currentPrompt = null;
    }

    this.logs.push({ id: seq++, key: "round", round: this.round });
    this._emit("round_start", { round: this.round });
  }

  _slotCount() {
    if (this.options.mode === "gif") return 1;
    return this.currentTemplate ? this.currentTemplate.slots.length : 1;
  }

  submitCaption(playerId, payload) {
    if (this.status !== "PLAYING" || this.phase !== "CAPTION") return false;
    if (!this.players.includes(playerId) || this.submissions[playerId]) return false;

    if (this.options.mode === "gif") {
      const gif = payload && (typeof payload.gif === "string" ? payload.gif : null);
      if (!gif || gif.length > 400 || !/^(https?:\/\/|data:image\/)/i.test(gif)) return false;
      this.submissions[playerId] = { gif };
    } else {
      const captions = payload && Array.isArray(payload.captions) ? payload.captions : null;
      if (!captions) return false;
      const cleaned = captions.slice(0, this._slotCount()).map((c) => {
        if (typeof c === 'object' && c !== null) {
           return {
             text: String(c.text == null ? "" : c.text).slice(0, 120),
             x: Number(c.x) || 50,
             y: Number(c.y) || 50,
             scale: Number.isFinite(c.scale) ? Math.max(0.2, Math.min(Number(c.scale), 5)) : 1,
             font: String(c.font || "Impact").slice(0, 30),
             border: Number.isFinite(c.border) ? Math.max(0, Math.min(Number(c.border), 10)) : 2,
             color: String(c.color || "white").slice(0, 20)
           };
        }
        return { text: String(c == null ? "" : c).slice(0, 120) };
      });
      if (cleaned.every((c) => !c.text.trim())) return false;
      this.submissions[playerId] = { captions: cleaned };
    }

    this._emit("submitted", { pid: playerId, count: Object.keys(this.submissions).length, total: this.players.length });
    this._maybeAdvance();
    return true;
  }

  _maybeAdvance() {
    if (this.phase === "CAPTION" && this.players.every((p) => this.submissions[p])) {
      this._startVoting();
    } else if (this.phase === "VOTE") {
      const voters = this.players.filter((p) => this.roundResults.some((r) => r.playerId !== p));
      if (voters.every((p) => this.votes[p])) this._tallyVotes();
    }
  }

  _startVoting() {
    this.phase = "VOTE";
    this.timeLeft = this.options.voteSeconds;
    this.votes = {};
    this.roundResults = Object.entries(this.submissions).map(([pid, sub]) => ({
      playerId: pid,
      captions: sub.captions || null,
      gif: sub.gif || null,
      voteCount: 0,
    }));
    this.roundResults.sort(() => Math.random() - 0.5);
    this.logs.push({ id: seq++, key: "vote" });
    this._emit("vote_start", {});
  }

  // Vote by stable entry index — authorship is hidden from voters, so they
  // send back the index they tapped and we resolve the author here.
  voteByIndex(playerId, index) {
    const entry = this.roundResults[index];
    return this.vote(playerId, entry ? entry.playerId : null);
  }

  vote(playerId, targetPlayerId) {
    if (this.status !== "PLAYING" || this.phase !== "VOTE") return false;
    if (!this.players.includes(playerId) || targetPlayerId === playerId || this.votes[playerId]) return false;
    if (!this.roundResults.some((r) => r.playerId === targetPlayerId)) return false;

    this.votes[playerId] = targetPlayerId;
    this._emit("voted", { pid: playerId, count: Object.keys(this.votes).length });
    this._maybeAdvance();
    return true;
  }

  _tallyVotes() {
    for (const targetId of Object.values(this.votes)) {
      const entry = this.roundResults.find((r) => r.playerId === targetId);
      if (entry) entry.voteCount++;
    }
    this.roundResults.sort((a, b) => b.voteCount - a.voteCount);

    // Winner(s) score their votes; a clean sweep is worth a bonus.
    const top = this.roundResults[0];
    if (top && top.voteCount > 0) {
      for (const r of this.roundResults) this.scores[r.playerId] = (this.scores[r.playerId] || 0) + r.voteCount;
      this.logs.push({ id: seq++, key: "winner", pid: top.playerId, votes: top.voteCount });
      this._emit("results", { pid: top.playerId, votes: top.voteCount });
    } else {
      this._emit("results", { pid: null, votes: 0 });
    }

    this.phase = "RESULTS";
    this.timeLeft = RESULTS_SECONDS;
  }

  /** One wall-clock second; returns true when the phase advanced. */
  tick() {
    if (this.status !== "PLAYING") return false;
    if (this.timeLeft > 0) this.timeLeft--;

    if (this.timeLeft > 0) return false;

    if (this.phase === "CAPTION") {
      // Anyone who didn't submit forfeits this round.
      this._startVoting();
      return true;
    }
    if (this.phase === "VOTE") {
      this._tallyVotes();
      return true;
    }
    if (this.phase === "RESULTS") {
      this._startRound();
      return true;
    }
    return false;
  }

  nextRound(playerId) {
    if (this.phase !== "RESULTS" || this.players[0] !== playerId) return false;
    if (this.status === "FINISHED") return false;
    this._startRound();
    return true;
  }

  _endGame() {
    this.status = "FINISHED";
    this.phase = "RESULTS";
    this.timeLeft = 0;
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length) {
      this.logs.push({ id: seq++, key: "gameOver", pid: sorted[0][0], score: sorted[0][1] });
      this._emit("game_over", { pid: sorted[0][0] });
    }
  }

  resetToLobby() {
    this.status = "WAITING";
    this.phase = "CAPTION";
    this.submissions = {};
    this.votes = {};
    this.roundResults = [];
    this.currentTemplate = null;
    this.currentPrompt = null;
    this.logs = [];
    this.events = [];
    return true;
  }

  botAct(playerId) {
    if (this.status !== "PLAYING") return;
    if (this.phase === "CAPTION" && !this.submissions[playerId]) {
      if (this.options.mode === "gif") {
        const g = GIF_LIBRARY[Math.floor(Math.random() * GIF_LIBRARY.length)];
        this.submitCaption(playerId, { gif: g.url });
      } else {
        const pool = BOT_CAPTIONS[this.lang] || BOT_CAPTIONS.en;
        const caps = [];
        for (let i = 0; i < this._slotCount(); i++) caps.push(pool[Math.floor(Math.random() * pool.length)]);
        this.submitCaption(playerId, { captions: caps });
      }
    } else if (this.phase === "VOTE" && !this.votes[playerId]) {
      const others = this.roundResults.filter((r) => r.playerId !== playerId);
      if (others.length) this.vote(playerId, others[Math.floor(Math.random() * others.length)].playerId);
    }
  }

  getStateForPlayer(playerId) {
    const reveal = this.phase === "RESULTS";
    return {
      lobbyId: this.lobbyId,
      lang: this.lang,
      status: this.status,
      mode: this.options.mode,
      options: { captionSeconds: this.options.captionSeconds, voteSeconds: this.options.voteSeconds, mode: this.options.mode },
      players: this.players,
      host: this.players[0],
      scores: this.scores,
      round: Math.min(this.round, this.maxRounds),
      maxRounds: this.maxRounds,
      phase: this.phase,
      timeLeft: this.timeLeft,
      currentTemplate: this.currentTemplate,
      currentPrompt: this.currentPrompt,
      slots: this._slotCount(),
      submittedPlayers: Object.keys(this.submissions),
      votedPlayers: Object.keys(this.votes),
      mySubmission: this.submissions[playerId] || null,
      hasSubmitted: !!this.submissions[playerId],
      hasVoted: !!this.votes[playerId],
      // Hide authorship until the reveal; `mine` still lets a player see (and be
      // blocked from voting for) their own entry, and `id` is the stable index
      // the client votes by.
      roundResults: reveal
        ? this.roundResults
        : this.roundResults.map((r, i) => ({ id: i, captions: r.captions, gif: r.gif, mine: r.playerId === playerId })),
      logs: this.logs.slice(-12),
      events: this.events.slice(-10),
    };
  }

  // Back-compat: the server still calls getState()/getStateForPlayer().
  getState() { return this.getStateForPlayer(null); }

  static getBotCaptions(lang) { return BOT_CAPTIONS[lang === "fr" ? "fr" : "en"]; }
  static getGifLibrary() { return GIF_LIBRARY; }
  static DEFAULT_OPTIONS = DEFAULT_OPTIONS;
  static sanitizeOptions = sanitizeOptions;
  static sanitizeCustomTemplates = sanitizeCustomTemplates;
}

module.exports = MemeGame;
