// PILE OF... (Cards Against–style) — server-authoritative game logic.
//
// A rotating Card Czar reads a black prompt; everyone else fills the blank(s)
// from their white-card hand (or writes a custom card); the Czar picks a winner.
// Phases SUBMIT → JUDGE → REVEAL advance when everyone has acted or a per-phase
// timer runs out. Everything the client animates/plays is on the event stream.

const BLACK_CARDS = {
  en: [
    "I drink to forget _____.",
    "What's that smell?",
    "I got 99 problems but _____ ain't one.",
    "_____ is a slippery slope that leads to _____.",
    "What ended my last relationship?",
    "In M. Night Shyamalan's newest movie, Bruce Willis discovers that _____ had really been _____ all along.",
    "What's the next Happy Meal toy?",
    "Alternative medicine is now embracing the curative powers of _____.",
    "What's my secret talent?",
    "What never fails to liven up the party?",
    "What's Batman's guilty pleasure?",
    "_____ + _____ = _____.",
    "TSA guidelines now prohibit _____ on airplanes.",
    "What's the most _____ thing about _____ ?",
    "The class field trip was ruined by _____.",
    "In a world ravaged by _____, our only solace is _____.",
    "What did I bring back from Mexico?",
    "What keeps me up at night?",
    "During Wrestlemania XXX, John Cena made his opponent tap out using _____.",
    "Step 1: _____. Step 2: _____. Step 3: Profit.",
    "Instead of coal, Santa now gives _____ to naughty children.",
    "What would grandma find disturbing, yet oddly charming?",
    "I couldn't complete my homework because of _____.",
    "Next on Fox News: _____ somehow linked to terrorism.",
    "When the pharaoh remained unmoved, Moses called forth _____.",
  ],
  fr: [
    "Je bois pour oublier _____.",
    "C'est quoi cette odeur ?",
    "J'ai 99 problèmes mais _____ n'en est pas un.",
    "_____ est une pente glissante qui mène à _____.",
    "Qu'est-ce qui a mis fin à ma dernière relation ?",
    "Dans le dernier film de M. Night Shyamalan, Bruce Willis découvre que _____ était en fait _____ depuis le début.",
    "Quel est le prochain jouet du Happy Meal ?",
    "La médecine alternative s'intéresse maintenant aux pouvoirs curatifs de _____.",
    "Quel est mon talent secret ?",
    "Qu'est-ce qui ne manque jamais d'animer une soirée ?",
    "Quel est le plaisir coupable de Batman ?",
    "_____ + _____ = _____.",
    "Les directives de la TSA interdisent désormais _____ dans les avions.",
    "Quelle est la chose la plus _____ à propos de _____ ?",
    "Le voyage scolaire a été gâché par _____.",
    "Dans un monde ravagé par _____, notre seul réconfort est _____.",
    "Qu'est-ce que j'ai ramené du Mexique ?",
    "Qu'est-ce qui m'empêche de dormir la nuit ?",
    "Lors de Wrestlemania XXX, John Cena a fait abandonner son adversaire en utilisant _____.",
    "Étape 1 : _____. Étape 2 : _____. Étape 3 : Profit.",
    "Au lieu de charbon, le Père Noël donne maintenant _____ aux enfants méchants.",
    "Qu'est-ce que grand-mère trouverait dérangeant, mais étrangement charmant ?",
    "Je n'ai pas pu finir mes devoirs à cause de _____.",
    "Prochainement sur Fox News : _____ serait lié au terrorisme.",
    "Quand le pharaon est resté insensible, Moïse a invoqué _____.",
  ],
};

const WHITE_CARDS = {
  en: [
    "Being on fire.", "Racism.", "Old-people smell.", "A micropenis.",
    "Women in yogurt commercials.", "Classist undertones.", "Not giving a shit about the third world.",
    "A salty surprise.", "A windmill full of corpses.", "Lunchables.",
    "Poverty.", "Chunks of dead hitchhiker.",
    "PB&J.", "Passive-aggressive Post-it notes.", "Fancy Feast.", "Flying sex snakes.",
    "Being a motherfucking sorcerer.", "A disappointing birthday party.",
    "Puppies!", "A brain tumor.", "Her Majesty, Queen Elizabeth II.",
    "Emotional baggage.", "A stray pube.",
    "When you fart and a little bit comes out.",
    "Gladiatorial combat.", "Road kill.", "The Easter Bunny.",
    "Full frontal nudity.", "Land mines.", "A defective condom.", "Actually funny female comedians.",
    "A gentle caress of the inner thigh.", "Vigorous jazz hands.",
    "The token minority.", "Opposable thumbs.",
    "A good sniff.", "Drinking alone.", "Hot cheese.", "World peace.",
    "Exactly $1.50.", "Your weird uncle.", "Anxiety.", "Horse meat.",
    "A bag of magic beans.", "Lactation.", "A really cool hat.", "My relationship status.",
    "Dying.", "Nicolas Cage.", "Hope.", "Emotions.", "Scientology.",
    "An uncomfortable amount of hair in the drain.", "My inner demons.",
    "Getting catfished.", "A PowerPoint presentation.",
  ],
  fr: [
    "Être en feu.", "Le racisme.", "L'odeur des vieilles personnes.", "Un micropénis.",
    "Les femmes dans les pubs de yaourts.", "Des sous-entendus classistes.", "S'en foutre du tiers-monde.",
    "Une surprise salée.", "Un moulin à vent plein de cadavres.", "Des Lunchables.",
    "La pauvreté.", "Des morceaux de l'auto-stoppeur mort.",
    "Un sandwich beurre de cacahuète confiture.", "Des Post-it passifs-agressifs.", "De la pâtée de luxe.", "Des serpents sexuels volants.",
    "Être un putain de sorcier.", "Une fête d'anniversaire décevante.",
    "Des chiots !", "Une tumeur au cerveau.", "Sa Majesté, la Reine Elizabeth II.",
    "Un bagage émotionnel.", "Un poil pubien égaré.",
    "Quand tu pètes et qu'il y a un petit truc qui sort.",
    "Un combat de gladiateurs.", "Un animal écrasé.", "Le lapin de Pâques.",
    "Une nudité frontale totale.", "Des mines terrestres.", "Un préservatif défectueux.", "Des humoristes femmes vraiment drôles.",
    "Une douce caresse à l'intérieur de la cuisse.", "Faire vigoureusement les mains de jazz.",
    "La minorité de service.", "Des pouces opposables.",
    "Une bonne inspiration.", "Boire seul.", "Du fromage fondu.", "La paix dans le monde.",
    "Exactement 1,50 €.", "Ton oncle bizarre.", "L'anxiété.", "De la viande de cheval.",
    "Un sac de haricots magiques.", "La lactation.", "Un chapeau vraiment cool.", "Ma situation amoureuse.",
    "Mourir.", "Nicolas Cage.", "L'espoir.", "Des émotions.", "La Scientologie.",
    "Une quantité inconfortable de cheveux dans le siphon.", "Mes démons intérieurs.",
    "Se faire arnaquer sur internet.", "Une présentation PowerPoint.",
  ],
};

const BOT_CUSTOM = {
  en: ["A suspicious lack of pants.", "My browser history.", "The intern.", "Pure spite.", "A questionable life choice."],
  fr: ["Un manque suspect de pantalon.", "Mon historique de navigation.", "Le stagiaire.", "De la pure méchanceté.", "Un choix de vie douteux."],
};

const DEFAULT_OPTIONS = { rounds: 8, timer: 60, allowCustom: true }; // timer seconds, 0 = infinite
const REVEAL_SECONDS = 7;

function sanitizeOptions(input) {
  const o = { ...DEFAULT_OPTIONS };
  if (!input || typeof input !== "object") return o;
  if (input.rounds != null) o.rounds = Math.min(20, Math.max(3, Math.round(Number(input.rounds)) || 8));
  if (input.timer != null) {
    const allowed = [0, 30, 60, 90];
    const t = Math.round(Number(input.timer));
    o.timer = allowed.includes(t) ? t : 60;
  }
  if (input.allowCustom != null) o.allowCustom = !!input.allowCustom;
  return o;
}

let nextCardId = 0;
let seq = 0;

class CahGame {
  constructor(lobbyId, opts = {}) {
    this.lobbyId = lobbyId;
    this.lang = opts.lang === "fr" ? "fr" : "en";
    this.options = sanitizeOptions(opts.options);

    this.status = "WAITING";
    this.players = [];
    this.hands = {};
    this.scores = {};
    this.czarIndex = 0;
    this.currentBlack = null;
    this.submissions = {};        // playerId -> [cards]
    this.revealedSubmissions = []; // shuffled { playerId, cards }
    this.phase = "SUBMIT";         // SUBMIT | JUDGE | REVEAL
    this.roundWinner = null;
    this.deck = [];
    this.blackDeck = [];
    this.round = 0;
    this.timeLeft = null;
    this.revealIn = 0;
    this.history = [];
    this.logs = [];
    this.events = [];
    this.eventSeq = 0;
  }

  get maxRounds() { return this.options.rounds; }
  get language() { return this.lang; }         // back-compat
  set language(v) { this.lang = v === "fr" ? "fr" : "en"; }

  _emit(type, data) {
    this.events.push({ seq: ++this.eventSeq, type, at: Date.now(), ...data });
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }

  setOptions(options) {
    if (this.status === "PLAYING") return false;
    this.options = sanitizeOptions({ ...this.options, ...options });
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
    const wasCzar = idx === this.czarIndex;
    this.players.splice(idx, 1);
    delete this.scores[playerId];
    delete this.submissions[playerId];
    delete this.hands[playerId];
    if (this.status === "PLAYING") {
      if (this.players.length < 2) { this._endGame(); return true; }
      if (idx < this.czarIndex) this.czarIndex--;
      if (this.czarIndex >= this.players.length) this.czarIndex = 0;
      if (wasCzar && this.phase !== "REVEAL") this._startJudging();
      else this._maybeAdvance();
    }
    return true;
  }

  start() {
    if (this.players.length < 3) return false;
    this.status = "PLAYING";
    this.round = 0;
    this.czarIndex = 0;
    this.scores = {};
    this.players.forEach((p) => { this.scores[p] = 0; });
    this.history = [];
    this.logs = [];
    this.events = [];

    const whites = WHITE_CARDS[this.lang] || WHITE_CARDS.en;
    const blacks = BLACK_CARDS[this.lang] || BLACK_CARDS.en;
    this.deck = whites.map((text) => ({ id: nextCardId++, text })).sort(() => Math.random() - 0.5);
    this.blackDeck = blacks.map((text) => ({ id: nextCardId++, text, pick: text.split("_____").length - 1 || 1 })).sort(() => Math.random() - 0.5);

    this.hands = {};
    this.players.forEach((p) => { this.hands[p] = this._draw(10); });

    this._startRound();
    return true;
  }

  _draw(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (this.deck.length === 0) {
        // reshuffle a fresh white pool if we run dry
        const whites = WHITE_CARDS[this.lang] || WHITE_CARDS.en;
        this.deck = whites.map((text) => ({ id: nextCardId++, text })).sort(() => Math.random() - 0.5);
      }
      out.push(this.deck.pop());
    }
    return out;
  }

  _startRound() {
    this.round++;
    if (this.round > this.maxRounds || this.blackDeck.length === 0) { this._endGame(); return; }

    this.currentBlack = this.blackDeck.pop();
    this.submissions = {};
    this.revealedSubmissions = [];
    this.roundWinner = null;
    this.phase = "SUBMIT";
    this.revealIn = 0;
    this.timeLeft = this.options.timer > 0 ? this.options.timer : null;

    this.logs.push({ id: seq++, key: "round", round: this.round, pid: this.players[this.czarIndex] });
    this._emit("round_start", { round: this.round, czar: this.players[this.czarIndex] });
  }

  _pick() { return this.currentBlack ? (this.currentBlack.pick || 1) : 1; }

  submitCards(playerId, cardIds) {
    if (this.status !== "PLAYING" || this.phase !== "SUBMIT") return false;
    if (this.players[this.czarIndex] === playerId || this.submissions[playerId]) return false;
    const hand = this.hands[playerId];
    if (!hand || !Array.isArray(cardIds) || cardIds.length !== this._pick()) return false;

    const cards = cardIds.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
    if (cards.length !== this._pick()) return false;

    this.submissions[playerId] = cards;
    this.hands[playerId] = hand.filter((c) => !cardIds.includes(c.id));
    this.hands[playerId].push(...this._draw(this._pick()));

    this._emit("submitted", { pid: playerId, count: Object.keys(this.submissions).length, total: this.players.length - 1 });
    this._maybeAdvance();
    return true;
  }

  submitCustomCards(playerId, texts) {
    if (!this.options.allowCustom) return false;
    if (this.status !== "PLAYING" || this.phase !== "SUBMIT") return false;
    if (this.players[this.czarIndex] === playerId || this.submissions[playerId]) return false;
    if (!Array.isArray(texts) || texts.length !== this._pick()) return false;
    const cards = texts.map((t) => ({ id: "custom_" + (nextCardId++), text: String(t).slice(0, 120), custom: true }));
    if (cards.some((c) => !c.text.trim())) return false;
    this.submissions[playerId] = cards;
    this._emit("submitted", { pid: playerId, count: Object.keys(this.submissions).length, total: this.players.length - 1 });
    this._maybeAdvance();
    return true;
  }

  _maybeAdvance() {
    const submitters = this.players.filter((_, i) => i !== this.czarIndex);
    if (this.phase === "SUBMIT" && submitters.length > 0 && submitters.every((p) => this.submissions[p])) {
      this._startJudging();
    }
  }

  _startJudging() {
    this.phase = "JUDGE";
    this.timeLeft = this.options.timer > 0 ? this.options.timer : null;
    const entries = Object.entries(this.submissions).map(([pid, cards]) => ({ playerId: pid, cards }));
    entries.sort(() => Math.random() - 0.5);
    this.revealedSubmissions = entries;
    this.logs.push({ id: seq++, key: "judging", pid: this.players[this.czarIndex] });
    this._emit("judging", {});
  }

  pickWinner(czarId, winnerPlayerId) {
    if (this.status !== "PLAYING" || this.phase !== "JUDGE") return false;
    if (this.players[this.czarIndex] !== czarId) return false;
    if (!this.submissions[winnerPlayerId]) return false;

    this.scores[winnerPlayerId] = (this.scores[winnerPlayerId] || 0) + 1;
    this.roundWinner = winnerPlayerId;
    this.phase = "REVEAL";
    this.timeLeft = null;
    this.revealIn = REVEAL_SECONDS;

    this.history.push({
      round: this.round,
      blackCard: this.currentBlack.text,
      whiteCards: this.submissions[winnerPlayerId].map((c) => c.text),
      winner: winnerPlayerId,
    });
    this.logs.push({ id: seq++, key: "winner", pid: winnerPlayerId });
    this._emit("winner", { pid: winnerPlayerId });
    return true;
  }

  nextRound(playerId) {
    if (this.phase !== "REVEAL" || this.players[0] !== playerId) return false;
    if (this.status === "FINISHED") return false;
    this.czarIndex = (this.czarIndex + 1) % this.players.length;
    this._startRound();
    return true;
  }

  /** One wall-clock second; returns true when the phase advanced. */
  tick() {
    if (this.status !== "PLAYING") return false;
    if (this.phase === "REVEAL") {
      this.revealIn--;
      if (this.revealIn <= 0) { this.czarIndex = (this.czarIndex + 1) % this.players.length; this._startRound(); return true; }
      return false;
    }
    if (this.timeLeft == null) return false;
    this.timeLeft--;
    if (this.timeLeft <= 0) { this._forceAction(); return true; }
    return false;
  }

  _forceAction() {
    if (this.phase === "SUBMIT") {
      this.players.forEach((p, i) => {
        if (i === this.czarIndex || this.submissions[p]) return;
        const hand = this.hands[p] || [];
        const ids = hand.slice(0, this._pick()).map((c) => c.id);
        if (ids.length === this._pick()) this.submitCards(p, ids);
      });
      // Nobody submitted at all → just move on to judging (empty)
      if (this.phase === "SUBMIT") this._startJudging();
    } else if (this.phase === "JUDGE") {
      if (this.revealedSubmissions.length > 0) {
        const pick = this.revealedSubmissions[Math.floor(Math.random() * this.revealedSubmissions.length)];
        this.pickWinner(this.players[this.czarIndex], pick.playerId);
      } else {
        // no submissions — skip round
        this.czarIndex = (this.czarIndex + 1) % this.players.length;
        this._startRound();
      }
    }
  }

  botAct(playerId) {
    if (this.status !== "PLAYING") return;
    const isCzar = this.players[this.czarIndex] === playerId;
    if (this.phase === "SUBMIT" && !isCzar && !this.submissions[playerId]) {
      // small chance to write a custom card
      if (this.options.allowCustom && Math.random() < 0.15) {
        const pool = BOT_CUSTOM[this.lang] || BOT_CUSTOM.en;
        const texts = Array.from({ length: this._pick() }, () => pool[Math.floor(Math.random() * pool.length)]);
        this.submitCustomCards(playerId, texts);
      } else {
        const hand = this.hands[playerId] || [];
        const shuffled = [...hand].sort(() => Math.random() - 0.5);
        const ids = shuffled.slice(0, this._pick()).map((c) => c.id);
        if (ids.length === this._pick()) this.submitCards(playerId, ids);
      }
    } else if (this.phase === "JUDGE" && isCzar && this.revealedSubmissions.length > 0) {
      const pick = this.revealedSubmissions[Math.floor(Math.random() * this.revealedSubmissions.length)];
      this.pickWinner(playerId, pick.playerId);
    }
  }

  _endGame() {
    this.status = "FINISHED";
    this.phase = "REVEAL";
    this.revealIn = 0;
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length) {
      this.logs.push({ id: seq++, key: "gameOver", pid: sorted[0][0], score: sorted[0][1] });
      this._emit("game_over", { pid: sorted[0][0] });
    }
  }

  resetToLobby() {
    this.status = "WAITING";
    this.phase = "SUBMIT";
    this.hands = {};
    this.submissions = {};
    this.revealedSubmissions = [];
    this.currentBlack = null;
    this.logs = [];
    this.events = [];
    this.history = [];
    return true;
  }

  getStateForPlayer(playerId) {
    const showSubs = this.phase === "JUDGE" || this.phase === "REVEAL";
    return {
      lobbyId: this.lobbyId,
      lang: this.lang,
      language: this.lang,
      status: this.status,
      options: this.options,
      players: this.players,
      host: this.players[0],
      scores: this.scores,
      czar: this.players[this.czarIndex],
      currentBlack: this.currentBlack,
      pick: this._pick(),
      hand: this.hands[playerId] || [],
      phase: this.phase,
      timeLeft: this.timeLeft,
      revealIn: this.revealIn,
      submittedPlayers: Object.keys(this.submissions),
      hasSubmitted: !!this.submissions[playerId],
      revealedSubmissions: showSubs ? this.revealedSubmissions : [],
      roundWinner: this.roundWinner,
      round: Math.min(this.round, this.maxRounds),
      maxRounds: this.maxRounds,
      allowCustom: this.options.allowCustom,
      history: this.history,
      logs: this.logs.slice(-12),
      events: this.events.slice(-10),
    };
  }

  static DEFAULT_OPTIONS = DEFAULT_OPTIONS;
  static sanitizeOptions = sanitizeOptions;
}

module.exports = CahGame;
