// Monopoly game logic — fully language-agnostic.
// The server never emits localized strings: the board carries stable ids, the
// card decks carry stable card ids, and every log entry is a { key, params }
// pair. The client (components/games/monopolyData.ts) owns all EN/FR text.

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#14b8a6'];

const RAILROADS = [5, 15, 25, 35];
const UTILITIES = [12, 28];

// Chance deck — actions are executed server-side; text lives on the client.
const CHANCE = [
  { id: 'ch_go',        action: 'move_to',     pos: 0,  collectGo: false },
  { id: 'ch_illinois',  action: 'move_to',     pos: 24, collectGo: true },
  { id: 'ch_charles',   action: 'move_to',     pos: 11, collectGo: true },
  { id: 'ch_util',      action: 'nearest_util' },
  { id: 'ch_rail',      action: 'nearest_rail' },
  { id: 'ch_dividend',  action: 'collect',     amount: 50 },
  { id: 'ch_gojf',      action: 'gojf' },
  { id: 'ch_back3',     action: 'move_by',     steps: -3 },
  { id: 'ch_jail',      action: 'jail' },
  { id: 'ch_repairs',   action: 'repairs',     perHouse: 25, perHotel: 100 },
  { id: 'ch_speeding',  action: 'pay',         amount: 15 },
  { id: 'ch_reading',   action: 'move_to',     pos: 5,  collectGo: true },
  { id: 'ch_boardwalk', action: 'move_to',     pos: 39, collectGo: false },
  { id: 'ch_chairman',  action: 'pay_each',    amount: 50 },
  { id: 'ch_loan',      action: 'collect',     amount: 150 },
  { id: 'ch_crossword', action: 'collect',     amount: 100 },
];

// Community Chest deck.
const CHEST = [
  { id: 'cc_go',        action: 'move_to',     pos: 0,  collectGo: false },
  { id: 'cc_bankerror', action: 'collect',     amount: 200 },
  { id: 'cc_doctor',    action: 'pay',         amount: 50 },
  { id: 'cc_stock',     action: 'collect',     amount: 50 },
  { id: 'cc_gojf',      action: 'gojf' },
  { id: 'cc_jail',      action: 'jail' },
  { id: 'cc_holiday',   action: 'collect',     amount: 100 },
  { id: 'cc_taxrefund', action: 'collect',     amount: 20 },
  { id: 'cc_birthday',  action: 'collect_each', amount: 10 },
  { id: 'cc_lifeins',   action: 'collect',     amount: 100 },
  { id: 'cc_hospital',  action: 'pay',         amount: 50 },
  { id: 'cc_school',    action: 'pay',         amount: 50 },
  { id: 'cc_consult',   action: 'collect',     amount: 25 },
  { id: 'cc_streets',   action: 'repairs',     perHouse: 40, perHotel: 115 },
  { id: 'cc_beauty',    action: 'collect',     amount: 10 },
  { id: 'cc_inherit',   action: 'collect',     amount: 100 },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const rid = () => Math.random().toString(36).slice(2, 11);

class MonopolyGame {
  constructor(lobbyId, lang = 'en') {
    this.lobbyId = lobbyId;
    this.lang = lang === 'fr' ? 'fr' : 'en';
    this.players = [];
    this.playerStates = {};
    this.status = 'WAITING';
    this.currentTurnIndex = 0;
    this.board = this.generateBoard();
    this.winner = null;
    this.turnPhase = 'ROLL'; // ROLL, ACTION, END
    this.lastRoll = null;
    this.rollId = null;
    this.currentRollDouble = false;
    this.doublesCount = 0;
    this.logs = [];
    this.activeCard = null; // { deck, cardId, drawId, pid } for the client card popup
    this.chanceDeck = shuffle(CHANCE);
    this.chestDeck = shuffle(CHEST);
  }

  generateBoard() {
    // `name` is kept only as an internal English fallback; the client renders
    // localized names keyed by `id`. Prices/rents are identical across editions.
    return [
      { id: 0, name: 'GO', type: 'corner' },
      { id: 1, name: 'Mediterranean Avenue', type: 'property', group: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 2, name: 'Community Chest', type: 'chest' },
      { id: 3, name: 'Baltic Avenue', type: 'property', group: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 4, name: 'Income Tax', type: 'tax', amount: 200 },
      { id: 5, name: 'Reading Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 6, name: 'Oriental Avenue', type: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 7, name: 'Chance', type: 'chance' },
      { id: 8, name: 'Vermont Avenue', type: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 9, name: 'Connecticut Avenue', type: 'property', group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 10, name: 'Jail', type: 'corner' },
      { id: 11, name: 'St. Charles Place', type: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 12, name: 'Electric Company', type: 'util', group: 'util', price: 150, mortgaged: false, owner: null },
      { id: 13, name: 'States Avenue', type: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 14, name: 'Virginia Avenue', type: 'property', group: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 15, name: 'Pennsylvania Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 16, name: 'St. James Place', type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 17, name: 'Community Chest', type: 'chest' },
      { id: 18, name: 'Tennessee Avenue', type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 19, name: 'New York Avenue', type: 'property', group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 20, name: 'Free Parking', type: 'corner' },
      { id: 21, name: 'Kentucky Avenue', type: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 22, name: 'Chance', type: 'chance' },
      { id: 23, name: 'Indiana Avenue', type: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 24, name: 'Illinois Avenue', type: 'property', group: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 25, name: 'B. & O. Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 26, name: 'Atlantic Avenue', type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 27, name: 'Ventnor Avenue', type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 28, name: 'Water Works', type: 'util', group: 'util', price: 150, mortgaged: false, owner: null },
      { id: 29, name: 'Marvin Gardens', type: 'property', group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 30, name: 'Go To Jail', type: 'corner' },
      { id: 31, name: 'Pacific Avenue', type: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 32, name: 'North Carolina Avenue', type: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 33, name: 'Community Chest', type: 'chest' },
      { id: 34, name: 'Pennsylvania Avenue', type: 'property', group: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 35, name: 'Short Line Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 36, name: 'Chance', type: 'chance' },
      { id: 37, name: 'Park Place', type: 'property', group: 'blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 38, name: 'Luxury Tax', type: 'tax', amount: 100 },
      { id: 39, name: 'Boardwalk', type: 'property', group: 'blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, houses: 0, mortgaged: false, owner: null },
    ];
  }

  // ---- player lifecycle -------------------------------------------------

  addPlayer(steamId, meta = {}) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (this.players.includes(steamId)) return false;
    const idx = this.players.length;
    this.players.push(steamId);
    this.playerStates[steamId] = {
      position: 0,
      money: 1500,
      jailed: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      token: idx % PLAYER_COLORS.length,
      isBot: !!meta.isBot || steamId.startsWith('BOT_'),
      name: meta.name || null,
    };
    return true;
  }

  // Full removal (used when a socket disconnects mid-game).
  removePlayer(steamId) {
    if (!this.playerStates[steamId]) return;
    const wasCurrent = this.players[this.currentTurnIndex] === steamId;
    for (const space of this.board) {
      if (space.owner === steamId) {
        space.owner = null;
        space.houses = 0;
        space.mortgaged = false;
      }
    }
    this.dropPlayer(steamId, wasCurrent);
  }

  dropPlayer(steamId, advanceTurn) {
    const idx = this.players.indexOf(steamId);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    delete this.playerStates[steamId];

    if (this.status === 'PLAYING' && this.players.length < 2) {
      this.status = 'FINISHED';
      this.winner = this.players[0] || null;
      if (this.winner) this.log('win', { pid: this.winner });
      return;
    }

    // Keep currentTurnIndex pointing at the right player after the splice.
    if (idx < this.currentTurnIndex) {
      this.currentTurnIndex -= 1;
    } else if (idx === this.currentTurnIndex && advanceTurn) {
      this.currentTurnIndex = this.currentTurnIndex % this.players.length;
      this.beginTurn();
    } else {
      this.currentTurnIndex = this.currentTurnIndex % this.players.length;
    }
  }

  log(key, params = {}) {
    this.logs.unshift({ id: rid(), key, params, ts: Date.now() });
    if (this.logs.length > 24) this.logs.pop();
  }

  start() {
    if (this.players.length < 2) return false;
    this.status = 'PLAYING';
    this.currentTurnIndex = Math.floor(Math.random() * this.players.length);
    this.turnPhase = 'ROLL';
    this.log('game_start', {});
    this.log('turn_start', { pid: this.players[this.currentTurnIndex] });
    return true;
  }

  // ---- money helpers ----------------------------------------------------

  liquidatableValue(steamId) {
    let v = 0;
    for (const s of this.board) {
      if (s.owner !== steamId) continue;
      if ((s.houses || 0) > 0) v += Math.floor(s.houseCost / 2) * s.houses;
      if (!s.mortgaged) v += Math.floor(s.price / 2);
    }
    return v;
  }

  // Force-mortgage / sell houses so a struggling player can cover a debt.
  autoLiquidate(steamId, needed) {
    const state = this.playerStates[steamId];
    // Sell houses first (evenly, highest first), then mortgage bare properties.
    let guard = 0;
    while (state.money < needed && guard++ < 200) {
      const withHouses = this.board
        .filter(s => s.owner === steamId && (s.houses || 0) > 0)
        .sort((a, b) => b.houses - a.houses);
      if (withHouses.length > 0) {
        const s = withHouses[0];
        s.houses -= 1;
        state.money += Math.floor(s.houseCost / 2);
        continue;
      }
      const mortgageable = this.board.filter(s => s.owner === steamId && !s.mortgaged && (s.houses || 0) === 0);
      if (mortgageable.length > 0) {
        const s = mortgageable[0];
        s.mortgaged = true;
        state.money += Math.floor(s.price / 2);
        continue;
      }
      break;
    }
  }

  // Charge a player. If they cannot cover it even after liquidation, they go
  // bankrupt to `creditor` (a playerId) or to the bank (null).
  charge(steamId, amount, creditor = null) {
    const state = this.playerStates[steamId];
    if (!state) return;
    if (state.money < amount) this.autoLiquidate(steamId, amount);
    if (state.money < amount) {
      this.declareBankrupt(steamId, creditor, amount);
      return;
    }
    state.money -= amount;
    if (creditor && this.playerStates[creditor]) this.playerStates[creditor].money += amount;
  }

  credit(steamId, amount) {
    const state = this.playerStates[steamId];
    if (state) state.money += amount;
  }

  declareBankrupt(debtor, creditor, owedAmount = 0) {
    const state = this.playerStates[debtor];
    if (!state || state.bankrupt) return;
    state.bankrupt = true;
    this.log('bankrupt', { pid: debtor, creditor: creditor || null });

    // Hand whatever cash is left, plus the properties, to the creditor.
    const remaining = Math.max(0, state.money);
    state.money = 0;
    if (creditor && this.playerStates[creditor]) {
      this.playerStates[creditor].money += remaining;
      for (const s of this.board) {
        if (s.owner === debtor) s.owner = creditor; // houses/mortgage carry over
      }
    } else {
      for (const s of this.board) {
        if (s.owner === debtor) { s.owner = null; s.houses = 0; s.mortgaged = false; }
      }
    }

    const wasCurrent = this.players[this.currentTurnIndex] === debtor;
    this.dropPlayer(debtor, wasCurrent);
  }

  // ---- turn flow --------------------------------------------------------

  beginTurn() {
    if (this.status !== 'PLAYING') return;
    this.turnPhase = 'ROLL';
    this.lastRoll = null;
    this.rollId = null;
    this.currentRollDouble = false;
    this.doublesCount = 0;
    this.activeCard = null;
    this.log('turn_start', { pid: this.players[this.currentTurnIndex] });
  }

  // Decide, after a landing has been resolved, whether the turn continues
  // (doubles) or ends.
  endOrRoll(steamId) {
    const state = this.playerStates[steamId];
    if (!state || this.status !== 'PLAYING') return;
    if (this.players[this.currentTurnIndex] !== steamId) return; // player was dropped
    if (state.jailed) { this.turnPhase = 'END'; return; }
    this.turnPhase = this.currentRollDouble ? 'ROLL' : 'END';
  }

  sendToJail(steamId, reason) {
    const state = this.playerStates[steamId];
    if (!state) return;
    state.position = 10;
    state.jailed = true;
    state.jailTurns = 0;
    this.currentRollDouble = false;
    this.doublesCount = 0;
    this.turnPhase = 'END';
    this.log('jail_enter', { pid: steamId, reason });
  }

  getRent(space, diceTotal) {
    if (space.mortgaged || space.owner == null) return 0;
    if (space.type === 'rail') {
      const owned = this.board.filter(s => s.type === 'rail' && s.owner === space.owner).length;
      return space.rent[Math.max(0, owned - 1)];
    }
    if (space.type === 'util') {
      const owned = this.board.filter(s => s.type === 'util' && s.owner === space.owner).length;
      return (owned === 2 ? 10 : 4) * diceTotal;
    }
    if ((space.houses || 0) > 0) return space.rent[space.houses];
    const groupProps = this.board.filter(s => s.group === space.group);
    const ownsAll = groupProps.every(s => s.owner === space.owner && !s.mortgaged);
    return ownsAll ? space.rent[0] * 2 : space.rent[0];
  }

  // Move a player to an absolute position, awarding GO if they pass it.
  moveTo(steamId, pos, { collectGo = true } = {}) {
    const state = this.playerStates[steamId];
    if (pos < state.position && collectGo) {
      state.money += 200;
      this.log('pass_go', { pid: steamId });
    }
    state.position = pos;
  }

  // Resolve the effect of the space a player has landed on. Shared by dice
  // moves and card-driven moves.
  resolveLanding(steamId, opts = {}) {
    const state = this.playerStates[steamId];
    if (!state || this.status !== 'PLAYING') return;
    const space = this.board[state.position];
    this.log('land', { pid: steamId, spaceId: space.id });

    if (space.id === 30) { this.sendToJail(steamId, 'space'); return; }

    switch (space.type) {
      case 'property':
      case 'rail':
      case 'util': {
        if (space.owner == null) {
          this.turnPhase = 'ACTION';
        } else if (space.owner !== steamId && !space.mortgaged) {
          const total = opts.diceTotal != null ? opts.diceTotal
            : (this.lastRoll ? this.lastRoll[0] + this.lastRoll[1] : 0);
          let rent = this.getRent(space, opts.utilForceTotal != null ? opts.utilForceTotal : total);
          if (opts.rentMultiplier) rent *= opts.rentMultiplier;
          this.log('pay_rent', { pid: steamId, otherPid: space.owner, amount: rent, spaceId: space.id });
          this.charge(steamId, rent, space.owner);
          this.endOrRoll(steamId);
        } else {
          this.endOrRoll(steamId);
        }
        break;
      }
      case 'tax': {
        this.log('pay_tax', { pid: steamId, amount: space.amount });
        this.charge(steamId, space.amount, null);
        this.endOrRoll(steamId);
        break;
      }
      case 'chance':
      case 'chest':
        this.drawCard(steamId, space.type);
        break;
      default: // GO, Jail (visiting), Free Parking
        this.endOrRoll(steamId);
    }
  }

  rollDice(steamId) {
    if (this.status !== 'PLAYING') return false;
    if (this.players[this.currentTurnIndex] !== steamId) return false;
    if (this.turnPhase !== 'ROLL') return false;

    const state = this.playerStates[steamId];
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const isDouble = die1 === die2;
    this.lastRoll = [die1, die2];
    this.rollId = rid();
    this.currentRollDouble = isDouble;
    this.activeCard = null;
    this.log('roll', { pid: steamId, d1: die1, d2: die2 });

    if (state.jailed) {
      if (isDouble) {
        state.jailed = false;
        state.jailTurns = 0;
        this.currentRollDouble = false; // leaving jail does not grant another turn
        this.log('jail_leave_doubles', { pid: steamId });
      } else {
        state.jailTurns++;
        if (state.jailTurns >= 3) {
          this.log('jail_fine', { pid: steamId });
          this.charge(steamId, 50, null);
          if (!this.playerStates[steamId]) return true;
          state.jailed = false;
          state.jailTurns = 0;
        } else {
          this.log('jail_fail', { pid: steamId });
          this.turnPhase = 'END';
          return true;
        }
      }
    } else if (isDouble) {
      this.doublesCount++;
      if (this.doublesCount === 3) {
        this.sendToJail(steamId, 'doubles');
        return true;
      }
    }

    const move = die1 + die2;
    let pos = state.position + move;
    if (pos >= 40) {
      pos -= 40;
      state.money += 200;
      this.log('pass_go', { pid: steamId });
    }
    state.position = pos;

    this.resolveLanding(steamId, { diceTotal: move });
    return true;
  }

  drawCard(steamId, deckType) {
    const deck = deckType === 'chance' ? this.chanceDeck : this.chestDeck;
    const card = deck.shift();
    deck.push(card);
    this.activeCard = { deck: deckType, cardId: card.id, drawId: rid(), pid: steamId };
    this.log('card', { pid: steamId, deck: deckType, cardId: card.id });

    const state = this.playerStates[steamId];
    switch (card.action) {
      case 'collect':
        this.credit(steamId, card.amount);
        this.endOrRoll(steamId);
        break;
      case 'pay':
        this.charge(steamId, card.amount, null);
        this.endOrRoll(steamId);
        break;
      case 'collect_each':
        for (const p of this.players) {
          if (p !== steamId) this.charge(p, card.amount, steamId);
        }
        this.endOrRoll(steamId);
        break;
      case 'pay_each':
        for (const p of [...this.players]) {
          if (p !== steamId) this.charge(steamId, card.amount, p);
          if (!this.playerStates[steamId]) return;
        }
        this.endOrRoll(steamId);
        break;
      case 'gojf':
        state.jailCards++;
        this.endOrRoll(steamId);
        break;
      case 'jail':
        this.sendToJail(steamId, 'card');
        break;
      case 'move_to':
        this.moveTo(steamId, card.pos, { collectGo: card.collectGo });
        this.resolveLanding(steamId, { fromCard: true });
        break;
      case 'move_by': {
        state.position = (state.position + card.steps + 40) % 40;
        this.resolveLanding(steamId, { fromCard: true });
        break;
      }
      case 'nearest_rail': {
        const target = RAILROADS.find(r => r > state.position);
        this.moveTo(steamId, target != null ? target : RAILROADS[0], { collectGo: true });
        this.resolveLanding(steamId, { fromCard: true, rentMultiplier: 2 });
        break;
      }
      case 'nearest_util': {
        const target = UTILITIES.find(u => u > state.position);
        this.moveTo(steamId, target != null ? target : UTILITIES[0], { collectGo: true });
        const roll = (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1);
        // Card rule: pay 10x the fresh roll regardless of how many utilities owned.
        this.resolveLanding(steamId, { fromCard: true, utilForceTotal: roll * 2.5 });
        break;
      }
      case 'repairs': {
        let houses = 0, hotels = 0;
        for (const s of this.board) {
          if (s.owner === steamId && s.type === 'property') {
            if (s.houses === 5) hotels++;
            else houses += s.houses;
          }
        }
        const bill = houses * card.perHouse + hotels * card.perHotel;
        if (bill > 0) this.charge(steamId, bill, null);
        this.endOrRoll(steamId);
        break;
      }
      default:
        this.endOrRoll(steamId);
    }
  }

  buyProperty(steamId) {
    if (this.status !== 'PLAYING') return false;
    if (this.players[this.currentTurnIndex] !== steamId || this.turnPhase !== 'ACTION') return false;

    const state = this.playerStates[steamId];
    const space = this.board[state.position];
    if (!['property', 'rail', 'util'].includes(space.type)) return false;
    if (space.owner !== null || state.money < space.price) return false;

    state.money -= space.price;
    space.owner = steamId;
    this.log('buy', { pid: steamId, spaceId: space.id });
    this.endOrRoll(steamId);
    return true;
  }

  // Decline to buy the property just landed on (respects the doubles re-roll).
  skipBuy(steamId) {
    if (this.status !== 'PLAYING') return false;
    if (this.players[this.currentTurnIndex] !== steamId || this.turnPhase !== 'ACTION') return false;
    this.endOrRoll(steamId);
    return true;
  }

  buildHouse(steamId, spaceId) {
    const space = this.board[spaceId];
    if (!space || space.owner !== steamId || space.type !== 'property') return false;
    const state = this.playerStates[steamId];

    const groupProps = this.board.filter(s => s.group === space.group);
    if (!groupProps.every(s => s.owner === steamId)) return false;
    if (groupProps.some(s => s.mortgaged)) return false;
    if (space.houses >= 5) return false;
    if (state.money < space.houseCost) return false;
    // Build evenly across the colour group.
    if (space.houses > Math.min(...groupProps.map(s => s.houses))) return false;

    state.money -= space.houseCost;
    space.houses++;
    this.log('build', { pid: steamId, spaceId: space.id, houses: space.houses });
    return true;
  }

  sellHouse(steamId, spaceId) {
    const space = this.board[spaceId];
    if (!space || space.owner !== steamId || space.type !== 'property') return false;
    if ((space.houses || 0) <= 0) return false;
    const groupProps = this.board.filter(s => s.group === space.group);
    // Sell evenly.
    if (space.houses < Math.max(...groupProps.map(s => s.houses))) return false;

    space.houses--;
    this.playerStates[steamId].money += Math.floor(space.houseCost / 2);
    this.log('sell_house', { pid: steamId, spaceId: space.id });
    return true;
  }

  mortgageProperty(steamId, spaceId) {
    const space = this.board[spaceId];
    if (!space || space.owner !== steamId || space.mortgaged) return false;
    if ((space.houses || 0) > 0) return false;
    // Cannot mortgage while other properties in the group still have houses.
    const groupProps = this.board.filter(s => s.group === space.group);
    if (space.type === 'property' && groupProps.some(s => (s.houses || 0) > 0)) return false;

    space.mortgaged = true;
    this.playerStates[steamId].money += Math.floor(space.price / 2);
    this.log('mortgage', { pid: steamId, spaceId: space.id });
    return true;
  }

  unmortgageProperty(steamId, spaceId) {
    const space = this.board[spaceId];
    if (!space || space.owner !== steamId || !space.mortgaged) return false;
    const cost = Math.ceil((space.price / 2) * 1.1); // principal + 10% interest
    const state = this.playerStates[steamId];
    if (state.money < cost) return false;

    state.money -= cost;
    space.mortgaged = false;
    this.log('unmortgage', { pid: steamId, spaceId: space.id });
    return true;
  }

  payJail(steamId) {
    const state = this.playerStates[steamId];
    if (!state || !state.jailed) return false;
    if (this.players[this.currentTurnIndex] !== steamId || this.turnPhase !== 'ROLL') return false;
    if (state.money < 50) return false;
    state.money -= 50;
    state.jailed = false;
    state.jailTurns = 0;
    this.log('jail_leave_pay', { pid: steamId });
    return true;
  }

  useJailCard(steamId) {
    const state = this.playerStates[steamId];
    if (!state || !state.jailed || state.jailCards <= 0) return false;
    if (this.players[this.currentTurnIndex] !== steamId || this.turnPhase !== 'ROLL') return false;
    state.jailCards--;
    state.jailed = false;
    state.jailTurns = 0;
    this.log('jail_leave_card', { pid: steamId });
    return true;
  }

  endTurn(steamId) {
    if (this.status !== 'PLAYING') return false;
    if (this.players[this.currentTurnIndex] !== steamId) return false;
    // Must act before ending: can't skip a required roll (unless stuck in jail).
    if (this.turnPhase === 'ROLL' && !this.playerStates[steamId].jailed) return false;
    if (this.turnPhase === 'ROLL' && this.playerStates[steamId].jailed) {
      // Chose not to pay/use card and didn't roll — advance jail counter.
      this.playerStates[steamId].jailTurns++;
    }

    // A player who rolled doubles and is still mid-turn keeps rolling.
    if (this.turnPhase === 'ROLL' && this.currentRollDouble && !this.playerStates[steamId].jailed) return false;

    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    this.beginTurn();
    return true;
  }

  getState() {
    return {
      lobbyId: this.lobbyId,
      lang: this.lang,
      status: this.status,
      players: this.players,
      playerStates: this.playerStates,
      currentTurn: this.status === 'PLAYING' ? this.players[this.currentTurnIndex] : null,
      turnPhase: this.turnPhase,
      board: this.board,
      winner: this.winner,
      lastRoll: this.lastRoll,
      rollId: this.rollId,
      isDouble: this.currentRollDouble,
      activeCard: this.activeCard,
      logs: this.logs,
    };
  }
}

module.exports = MonopolyGame;
