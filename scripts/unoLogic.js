// OUNO — server-authoritative card game logic.
//
// Everything the client animates or plays a sound for is driven by the event
// stream this class emits (see `_emit`), so the browser never has to guess what
// just happened from a diff of two states.

// ---------------------------------------------------------------------------
// Rules & optional cards
// ---------------------------------------------------------------------------
const DEFAULT_RULES = {
  stacking: true,          // +2/+4/+6 pile up instead of resolving immediately
  stackAnyDraw: false,     // when stacking, any draw card answers any other
  sevenZero: false,        // 7 = swap hands with a player, 0 = rotate all hands
  jumpIn: true,            // play an identical card out of turn
  playOnDraw: true,        // you may play the card you just drew
  drawToMatch: false,      // keep drawing until something is playable
  forcePlay: false,        // if you hold a playable card you may not draw
  challengeDrawFour: false,// a +4 can be challenged as a bluff
  startingCards: 7,

  // OUNO calling — the punitive part
  callWindowMs: 5000,      // how long you have to shout OUNO after hitting 1 card
  autoPenalty: true,       // the table punishes you even if nobody catches it
  forgotPenalty: 4,        // cards drawn for forgetting
  falseCallPenalty: 2,     // cards drawn for calling with the wrong hand size
  falseCatchPenalty: 2,    // cards drawn for a bad catch
};

const DEFAULT_EXTRA_CARDS = {
  swapHands: false,        // wild: swap hands with a player of your choice
  shuffleHands: false,     // wild: pool every hand, shuffle, redeal
  skipAll: false,          // coloured: everyone is skipped, you play again
  discardAll: false,       // coloured: bin every card of that colour you hold
  drawSix: false,          // coloured +6
};

const DRAW_VALUES = { '+2': 2, '+4': 4, '+6': 6 };
const WILD_VALUES = ['color_picker', '+4', 'swap', 'shuffle'];
const COLORS = ['red', 'yellow', 'green', 'blue'];

const isDrawCard = (card) => DRAW_VALUES[card.value] != null;

function sanitizeRules(input) {
  const rules = { ...DEFAULT_RULES };
  if (!input || typeof input !== 'object') return rules;
  for (const key of Object.keys(DEFAULT_RULES)) {
    if (input[key] == null) continue;
    if (typeof DEFAULT_RULES[key] === 'boolean') rules[key] = !!input[key];
    else rules[key] = Number(input[key]);
  }
  // Clamp the numeric knobs so a crafted payload can't wedge a game.
  rules.startingCards = Math.min(12, Math.max(3, Math.round(rules.startingCards) || 7));
  rules.callWindowMs = Math.min(20000, Math.max(1500, Math.round(rules.callWindowMs) || 5000));
  rules.forgotPenalty = Math.min(8, Math.max(1, Math.round(rules.forgotPenalty) || 4));
  rules.falseCallPenalty = Math.min(8, Math.max(0, Math.round(rules.falseCallPenalty)));
  rules.falseCatchPenalty = Math.min(8, Math.max(0, Math.round(rules.falseCatchPenalty)));
  return rules;
}

function sanitizeExtras(input) {
  const extras = { ...DEFAULT_EXTRA_CARDS };
  if (!input || typeof input !== 'object') return extras;
  for (const key of Object.keys(DEFAULT_EXTRA_CARDS)) {
    if (input[key] != null) extras[key] = !!input[key];
  }
  return extras;
}

let cardSeq = 0;
const mkCard = (color, value) => ({ color, value, id: `c${(cardSeq++).toString(36)}${Math.random().toString(36).slice(2, 7)}` });

class UnoGame {
  constructor(lobbyId, opts = {}) {
    this.lobbyId = lobbyId;
    this.lang = opts.lang === 'fr' ? 'fr' : 'en';
    this.players = [];
    this.hands = {};
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.direction = 1;
    this.status = 'WAITING';
    this.currentColor = null;
    this.winner = null;
    this.drawPenalty = 0;
    this.hasDrawnThisTurn = false;
    this.calledUno = {};

    this.rules = sanitizeRules(opts.rules);
    this.extras = sanitizeExtras(opts.extras);

    // steamId -> epoch ms by which they must call OUNO (Infinity = no auto-fine)
    this.unoDeadlines = {};
    // Pending +4 bluff challenge, when the rule is on.
    this.challenge = null;
    // Where the last card came from / went, so the client can animate it.
    this.lastPlay = null;
    this.lastDraw = null;

    this.events = [];
    this.eventSeq = 0;

    this.deck = this.generateDeck();
    this.shuffle(this.deck);
  }

  setConfig(rules, extras) {
    if (this.status === 'PLAYING') return false;
    if (rules) this.rules = sanitizeRules({ ...this.rules, ...rules });
    if (extras) this.extras = sanitizeExtras({ ...this.extras, ...extras });
    this.deck = this.generateDeck();
    this.shuffle(this.deck);
    return true;
  }

  // -------------------------------------------------------------------------
  // Deck
  // -------------------------------------------------------------------------
  generateDeck() {
    const deck = [];
    for (const color of COLORS) {
      deck.push(mkCard(color, '0'));
      for (let i = 1; i <= 9; i++) {
        deck.push(mkCard(color, String(i)));
        deck.push(mkCard(color, String(i)));
      }
      for (let i = 0; i < 2; i++) {
        deck.push(mkCard(color, 'skip'));
        deck.push(mkCard(color, 'reverse'));
        deck.push(mkCard(color, '+2'));
      }
      if (this.extras.skipAll) { deck.push(mkCard(color, 'skip_all')); deck.push(mkCard(color, 'skip_all')); }
      if (this.extras.discardAll) deck.push(mkCard(color, 'discard_all'));
      if (this.extras.drawSix) deck.push(mkCard(color, '+6'));
    }
    for (let i = 0; i < 4; i++) {
      deck.push(mkCard('wild', 'color_picker'));
      deck.push(mkCard('wild', '+4'));
      if (this.extras.swapHands) deck.push(mkCard('wild', 'swap'));
    }
    if (this.extras.shuffleHands) {
      deck.push(mkCard('wild', 'shuffle'));
      deck.push(mkCard('wild', 'shuffle'));
    }
    return deck;
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /** Refill the draw pile from the discard pile, keeping the visible top card. */
  _replenish() {
    if (this.deck.length > 0) return true;
    if (this.discardPile.length <= 1) return false;
    const topCard = this.discardPile.pop();
    this.deck = this.discardPile;
    this.discardPile = [topCard];
    // A wild that was resolved to a colour goes back to the pile as a wild.
    for (const c of this.deck) if (WILD_VALUES.includes(c.value)) c.color = 'wild';
    this.shuffle(this.deck);
    this._emit('reshuffle', {});
    return this.deck.length > 0;
  }

  // -------------------------------------------------------------------------
  // Events — consumed by the client for sound + motion
  // -------------------------------------------------------------------------
  _emit(type, data) {
    this.events.push({ seq: ++this.eventSeq, type, at: Date.now(), ...data });
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------
  addPlayer(steamId) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (!this.players.includes(steamId)) {
      this.players.push(steamId);
      this.hands[steamId] = [];
      this.calledUno[steamId] = false;
    }
    return true;
  }

  removePlayer(steamId) {
    const idx = this.players.indexOf(steamId);
    this.players = this.players.filter(p => p !== steamId);
    delete this.hands[steamId];
    delete this.calledUno[steamId];
    delete this.unoDeadlines[steamId];
    if (idx !== -1 && idx < this.currentTurnIndex) this.currentTurnIndex--;
    if (this.currentTurnIndex >= this.players.length) this.currentTurnIndex = 0;
    if (this.players.length === 0) this.status = 'FINISHED';
  }

  start() {
    if (this.players.length < 2) return false;

    this.deck = this.generateDeck();
    this.shuffle(this.deck);
    this.discardPile = [];
    this.unoDeadlines = {};
    this.challenge = null;
    this.events = [];
    this.eventSeq = 0;

    for (const steamId of this.players) {
      this.hands[steamId] = this.deck.splice(0, this.rules.startingCards);
      this.calledUno[steamId] = false;
    }

    // The starter must be an ordinary coloured card so nobody is punished
    // before their first turn.
    let firstCard = this.deck.pop();
    let guard = 0;
    while (firstCard && (firstCard.color === 'wild' || DRAW_VALUES[firstCard.value] || firstCard.value === 'skip_all') && guard++ < 200) {
      this.deck.unshift(firstCard);
      firstCard = this.deck.pop();
    }
    this.discardPile.push(firstCard);
    this.currentColor = firstCard.color;

    this.status = 'PLAYING';
    this.currentTurnIndex = Math.floor(Math.random() * this.players.length);
    this.hasDrawnThisTurn = false;
    this.drawPenalty = 0;
    this.lastPlay = null;
    this.lastDraw = null;
    this._emit('deal', { count: this.rules.startingCards });
    return true;
  }

  resetToLobby() {
    this.status = 'WAITING';
    this.winner = null;
    this.deck = this.generateDeck();
    this.shuffle(this.deck);
    this.discardPile = [];
    this.currentColor = null;
    this.currentTurnIndex = 0;
    this.hasDrawnThisTurn = false;
    this.drawPenalty = 0;
    this.unoDeadlines = {};
    this.challenge = null;
    this.lastPlay = null;
    this.lastDraw = null;
    this.events = [];
    for (const p of this.players) {
      this.hands[p] = [];
      this.calledUno[p] = false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // OUNO calling
  // -------------------------------------------------------------------------

  /** Open/close the call window for everyone, based on current hand sizes. */
  _syncUnoWindows(now = Date.now()) {
    for (const p of this.players) {
      const n = this.hands[p] ? this.hands[p].length : 0;
      if (n === 1 && this.status === 'PLAYING') {
        if (!this.calledUno[p] && this.unoDeadlines[p] == null) {
          this.unoDeadlines[p] = this.rules.autoPenalty ? now + this.rules.callWindowMs : Infinity;
        }
      } else {
        delete this.unoDeadlines[p];
        if (n !== 1) this.calledUno[p] = false;
      }
    }
  }

  /** Earliest pending deadline, so the server knows when to wake up. */
  nextUnoDeadline() {
    let best = null;
    for (const p of Object.keys(this.unoDeadlines)) {
      const d = this.unoDeadlines[p];
      if (!isFinite(d)) continue;
      if (best == null || d < best) best = d;
    }
    return best;
  }

  /** Fine anyone whose window has lapsed. Returns true when something changed. */
  resolveUnoWindows(now = Date.now()) {
    if (this.status !== 'PLAYING') return false;
    let changed = false;
    for (const p of Object.keys(this.unoDeadlines)) {
      if (this.unoDeadlines[p] > now) continue;
      delete this.unoDeadlines[p];
      if (this.hands[p] && this.hands[p].length === 1 && !this.calledUno[p]) {
        this.forceDraw(p, this.rules.forgotPenalty);
        this._emit('uno_forgot', { pid: p, amount: this.rules.forgotPenalty });
        changed = true;
      }
    }
    if (changed) this._syncUnoWindows(now);
    return changed;
  }

  /**
   * Shout OUNO. Only legal while you actually hold a single card and the window
   * is still open — calling early costs you cards.
   */
  callUno(steamId) {
    if (this.status !== 'PLAYING') return { ok: false, reason: 'not_playing' };
    if (!this.players.includes(steamId)) return { ok: false, reason: 'not_playing' };
    if (this.calledUno[steamId]) return { ok: false, reason: 'already_called' };

    const n = this.hands[steamId] ? this.hands[steamId].length : 0;
    if (n !== 1) {
      if (this.rules.falseCallPenalty > 0) this.forceDraw(steamId, this.rules.falseCallPenalty);
      this._syncUnoWindows();
      this._emit('uno_false_call', { pid: steamId, amount: this.rules.falseCallPenalty });
      return { ok: false, reason: 'wrong_hand_size', penalty: this.rules.falseCallPenalty };
    }

    this.calledUno[steamId] = true;
    delete this.unoDeadlines[steamId];
    this._emit('uno_called', { pid: steamId });
    return { ok: true };
  }

  /** Catch someone who is sitting on one card in silence. */
  catchUno(callerId, targetId) {
    if (this.status !== 'PLAYING') return { ok: false, reason: 'not_playing' };
    if (callerId === targetId) return { ok: false, reason: 'self' };
    if (!this.players.includes(callerId) || !this.players.includes(targetId)) {
      return { ok: false, reason: 'unknown_player' };
    }

    const vulnerable = this.hands[targetId]
      && this.hands[targetId].length === 1
      && !this.calledUno[targetId]
      && this.unoDeadlines[targetId] != null;

    if (vulnerable) {
      delete this.unoDeadlines[targetId];
      this.forceDraw(targetId, this.rules.forgotPenalty);
      this._syncUnoWindows();
      this._emit('uno_caught', { pid: targetId, byPid: callerId, amount: this.rules.forgotPenalty });
      return { ok: true, amount: this.rules.forgotPenalty };
    }

    if (this.rules.falseCatchPenalty > 0) this.forceDraw(callerId, this.rules.falseCatchPenalty);
    this._syncUnoWindows();
    this._emit('uno_false_catch', { pid: callerId, targetPid: targetId, amount: this.rules.falseCatchPenalty });
    return { ok: false, reason: 'no_catch', penalty: this.rules.falseCatchPenalty };
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------
  forceDraw(steamId, count) {
    const drawn = [];
    for (let k = 0; k < count; k++) {
      if (this.deck.length === 0 && !this._replenish()) break;
      const card = this.deck.pop();
      if (!card) break;
      this.hands[steamId].push(card);
      drawn.push(card);
    }
    if (drawn.length > 0) {
      this.calledUno[steamId] = false;
      this.lastDraw = { pid: steamId, count: drawn.length, at: Date.now() };
    }
    return drawn;
  }

  _matches(card, topCard) {
    if (card.color === 'wild') return true;
    if (card.color === this.currentColor) return true;
    return topCard ? card.value === topCard.value : false;
  }

  _hasPlayable(steamId) {
    const topCard = this.discardPile[this.discardPile.length - 1];
    const hand = this.hands[steamId] || [];
    if (this.drawPenalty > 0) return hand.some(c => this._answersPenalty(c, topCard));
    return hand.some(c => this._matches(c, topCard));
  }

  _answersPenalty(card, topCard) {
    if (!this.rules.stacking || !isDrawCard(card)) return false;
    if (this.rules.stackAnyDraw) return true;
    return card.value === topCard.value;
  }

  drawCard(steamId) {
    if (this.status !== 'PLAYING') return null;
    if (this.players[this.currentTurnIndex] !== steamId) return null;
    if (this.hasDrawnThisTurn) return null;
    if (this.rules.forcePlay && this.drawPenalty === 0 && this._hasPlayable(steamId)) return null;

    const isPenaltyDraw = this.drawPenalty > 0;
    const penalty = this.drawPenalty;
    this.drawPenalty = 0;
    this.challenge = null;

    let drawn;
    if (isPenaltyDraw) {
      drawn = this.forceDraw(steamId, penalty);
      this._emit('penalty_draw', { pid: steamId, count: drawn.length });
    } else if (this.rules.drawToMatch) {
      drawn = [];
      const topCard = this.discardPile[this.discardPile.length - 1];
      for (let k = 0; k < 24; k++) {
        const one = this.forceDraw(steamId, 1);
        if (one.length === 0) break;
        drawn.push(one[0]);
        if (this._matches(one[0], topCard)) break;
      }
      this._emit('draw', { pid: steamId, count: drawn.length });
    } else {
      drawn = this.forceDraw(steamId, 1);
      this._emit('draw', { pid: steamId, count: drawn.length });
    }

    if (!isPenaltyDraw && this.rules.playOnDraw) this.hasDrawnThisTurn = true;
    else this.nextTurn();

    this._syncUnoWindows();
    return drawn.length > 0 ? drawn[0] : null;
  }

  passTurn(steamId) {
    if (this.status !== 'PLAYING') return false;
    if (this.players[this.currentTurnIndex] !== steamId) return false;
    if (!this.hasDrawnThisTurn) return false;
    this.nextTurn();
    this._syncUnoWindows();
    return true;
  }

  /**
   * Challenge a +4: if the player who threw it was holding the live colour they
   * eat the pile, otherwise the challenger eats it plus two.
   */
  challengeDrawFour(steamId) {
    if (this.status !== 'PLAYING') return { ok: false, reason: 'not_playing' };
    if (!this.rules.challengeDrawFour) return { ok: false, reason: 'rule_off' };
    if (!this.challenge || this.challenge.target !== steamId) return { ok: false, reason: 'nothing_to_challenge' };
    if (this.players[this.currentTurnIndex] !== steamId) return { ok: false, reason: 'not_your_turn' };

    const { from, legal } = this.challenge;
    const pile = this.drawPenalty || 4;
    this.challenge = null;
    this.drawPenalty = 0;

    if (!legal) {
      this.forceDraw(from, pile);
      this._emit('challenge_won', { pid: steamId, targetPid: from, amount: pile });
      this._syncUnoWindows();
      return { ok: true, bluff: true, amount: pile };
    }

    this.forceDraw(steamId, pile + 2);
    this._emit('challenge_lost', { pid: steamId, targetPid: from, amount: pile + 2 });
    this.nextTurn();
    this._syncUnoWindows();
    return { ok: true, bluff: false, amount: pile + 2 };
  }

  // -------------------------------------------------------------------------
  // Playing
  // -------------------------------------------------------------------------
  playCard(steamId, cardId, declaredColor = null, targetSteamId = null) {
    if (this.status !== 'PLAYING') return false;

    const hand = this.hands[steamId];
    if (!hand) return false;
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = hand[cardIndex];
    const topCard = this.discardPile[this.discardPile.length - 1];
    const isTurn = this.players[this.currentTurnIndex] === steamId;

    let isJumpIn = false;
    if (!isTurn) {
      const identical = card.color !== 'wild' && topCard
        && card.color === topCard.color && card.value === topCard.value;
      if (!this.rules.jumpIn || !identical || this.drawPenalty > 0) return false;
      isJumpIn = true;
      this.currentTurnIndex = this.players.indexOf(steamId);
      this.hasDrawnThisTurn = false;
    } else if (this.drawPenalty > 0) {
      if (!this._answersPenalty(card, topCard)) return false;
    } else if (!this._matches(card, topCard)) {
      return false;
    }

    // A +4 is a bluff when its owner could legally have followed the colour.
    const bluffing = card.value === '+4'
      && hand.some((c, i) => i !== cardIndex && c.color === this.currentColor);

    hand.splice(cardIndex, 1);
    this.discardPile.push(card);
    this.currentColor = card.color === 'wild'
      ? (COLORS.includes(declaredColor) ? declaredColor : COLORS[Math.floor(Math.random() * 4)])
      : card.color;
    if (card.color === 'wild') card.declaredColor = this.currentColor;

    this.lastPlay = { pid: steamId, cardId: card.id, at: Date.now(), jumpIn: isJumpIn };
    this._emit('play', { pid: steamId, value: card.value, color: this.currentColor, jumpIn: isJumpIn });

    // Emptying your hand ends the game right there — nothing else resolves.
    if (hand.length === 0) return this._declareWinner(steamId);

    this.challenge = null;
    let skipAdvance = false;

    switch (card.value) {
      case 'skip':
        this.nextTurn();
        this._emit('skip', { pid: this.players[this.currentTurnIndex] });
        break;

      case 'reverse':
        this.direction *= -1;
        this._emit('reverse', { direction: this.direction });
        if (this.players.length === 2) this.nextTurn();
        break;

      case '+2':
      case '+4':
      case '+6': {
        const amount = DRAW_VALUES[card.value];
        if (this.rules.stacking) {
          this.drawPenalty += amount;
          this._emit('stack', { pid: steamId, total: this.drawPenalty });
          if (card.value === '+4' && this.rules.challengeDrawFour) {
            this.challenge = { from: steamId, target: this._peekNextPlayer(), legal: !bluffing };
          }
        } else {
          this.nextTurn();
          const victim = this.players[this.currentTurnIndex];
          this.forceDraw(victim, amount);
          this._emit('penalty_draw', { pid: victim, count: amount });
        }
        break;
      }

      case 'skip_all':
        // Everyone else loses their turn; the play comes straight back.
        this._emit('skip_all', { pid: steamId });
        skipAdvance = true;
        break;

      case 'discard_all': {
        const colour = card.color;
        const dumped = [];
        this.hands[steamId] = hand.filter(c => {
          if (c.color === colour) { dumped.push(c); return false; }
          return true;
        });
        this.discardPile.push(...dumped);
        this._emit('discard_all', { pid: steamId, count: dumped.length, color: colour });
        if (this.hands[steamId].length === 0) return this._declareWinner(steamId);
        break;
      }

      case 'swap': {
        if (targetSteamId && this.players.includes(targetSteamId) && targetSteamId !== steamId) {
          const mine = this.hands[steamId];
          this.hands[steamId] = this.hands[targetSteamId];
          this.hands[targetSteamId] = mine;
          this._emit('swap', { pid: steamId, targetPid: targetSteamId });
        }
        break;
      }

      case 'shuffle': {
        const pool = [];
        for (const p of this.players) pool.push(...this.hands[p]);
        this.shuffle(pool);
        // Redeal one at a time starting from the player after the thrower.
        for (const p of this.players) this.hands[p] = [];
        let idx = this.players.indexOf(steamId);
        while (pool.length > 0) {
          idx = this._step(idx, 1);
          this.hands[this.players[idx]].push(pool.pop());
        }
        this._emit('shuffle_hands', { pid: steamId });
        break;
      }

      case '0':
        if (this.rules.sevenZero) {
          const rotated = {};
          for (let i = 0; i < this.players.length; i++) {
            rotated[this.players[this._step(i, 1)]] = this.hands[this.players[i]];
          }
          this.hands = rotated;
          this._emit('rotate_hands', { pid: steamId, direction: this.direction });
        }
        break;

      case '7':
        if (this.rules.sevenZero && targetSteamId && this.players.includes(targetSteamId) && targetSteamId !== steamId) {
          const mine = this.hands[steamId];
          this.hands[steamId] = this.hands[targetSteamId];
          this.hands[targetSteamId] = mine;
          this._emit('swap', { pid: steamId, targetPid: targetSteamId });
        }
        break;
    }

    if (!skipAdvance) this.nextTurn();
    else this.hasDrawnThisTurn = false;

    this._syncUnoWindows();
    return true;
  }

  _declareWinner(steamId) {
    this.status = 'FINISHED';
    this.winner = steamId;
    this.unoDeadlines = {};
    this.challenge = null;
    this._emit('win', { pid: steamId });
    return true;
  }

  _step(index, times) {
    const n = this.players.length;
    return ((index + this.direction * times) % n + n) % n;
  }

  _peekNextPlayer() {
    return this.players[this._step(this.currentTurnIndex, 1)];
  }

  nextTurn() {
    this.currentTurnIndex = this._step(this.currentTurnIndex, 1);
    this.hasDrawnThisTurn = false;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  getStateForPlayer(steamId) {
    const now = Date.now();
    const opponents = {};
    for (const p of this.players) {
      if (p === steamId) continue;
      opponents[p] = {
        count: this.hands[p] ? this.hands[p].length : 0,
        calledUno: !!this.calledUno[p],
        // How long is left to catch them, in ms (null when they're safe).
        catchableFor: this.unoDeadlines[p] != null
          ? (isFinite(this.unoDeadlines[p]) ? Math.max(0, this.unoDeadlines[p] - now) : -1)
          : null,
      };
    }

    const myDeadline = this.unoDeadlines[steamId];
    const isMyTurn = this.status === 'PLAYING' && this.players[this.currentTurnIndex] === steamId;

    return {
      lobbyId: this.lobbyId,
      lang: this.lang,
      status: this.status,
      players: this.players,
      currentTurn: this.status === 'PLAYING' ? this.players[this.currentTurnIndex] : null,
      nextTurn: this.status === 'PLAYING' ? this._peekNextPlayer() : null,
      direction: this.direction,
      topCard: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null,
      currentColor: this.currentColor,
      hand: this.hands[steamId] || [],
      deckCount: this.deck.length,
      opponents,
      winner: this.winner,
      rules: this.rules,
      extras: this.extras,
      drawPenalty: this.drawPenalty,
      hasDrawnThisTurn: isMyTurn ? this.hasDrawnThisTurn : false,
      calledUno: !!this.calledUno[steamId],
      // ms left to shout OUNO; -1 means "open until you act", null means no window
      unoWindowMs: myDeadline != null ? (isFinite(myDeadline) ? Math.max(0, myDeadline - now) : -1) : null,
      canChallenge: !!(this.challenge && this.challenge.target === steamId && isMyTurn && this.drawPenalty > 0),
      lastPlay: this.lastPlay,
      lastDraw: this.lastDraw,
      events: this.events.slice(-12),
    };
  }
}

UnoGame.DEFAULT_RULES = DEFAULT_RULES;
UnoGame.DEFAULT_EXTRA_CARDS = DEFAULT_EXTRA_CARDS;
UnoGame.sanitizeRules = sanitizeRules;
UnoGame.sanitizeExtras = sanitizeExtras;

module.exports = UnoGame;
