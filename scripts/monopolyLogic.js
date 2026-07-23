// Monopoly game logic — fully language-agnostic.
// The server never emits localized strings: the board carries stable ids, the
// card decks carry stable card ids, and every log entry is a { key, params }
// pair. The client (components/games/monopolyData.ts) owns all EN/FR text.

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#14b8a6'];

// Board definitions (tiles + card decks) live in a shared, data-driven module
// so both this engine and the client can consume any board.
const { getBoard, DEFAULT_CHANCE, DEFAULT_CHEST } = require('./boardDefs');

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
  constructor(lobbyId, lang = 'en', boardDef = null, opts = {}) {
    this.lobbyId = lobbyId;
    this.lang = lang === 'fr' ? 'fr' : 'en';
    // Team mode: 'ffa' (free-for-all) or '2v2' (allies — no teammate rent, a
    // team wins when the other team is fully out).
    this.teamMode = opts.teamMode === '2v2' ? '2v2' : 'ffa';

    // Board is data-driven: everything special about the board (its size, corner
    // roles, economy, theme, card decks) comes from the definition.
    const def = boardDef || getBoard('classic');
    this.boardId = def.id;
    this.boardName = def.name;
    this.perSide = def.perSide;
    this.roles = def.roles;                 // { go, jail, goToJail, freeParking }
    this.startingMoney = def.startingMoney;
    this.passGo = def.passGo;
    this.theme = def.theme;
    this.currency = def.currency;

    this.players = [];
    this.playerStates = {};
    this.status = 'WAITING';
    this.currentTurnIndex = 0;
    this.board = this.buildBoard(def);
    this.railIndices = this.board.filter(s => s.type === 'rail').map(s => s.id);
    this.utilIndices = this.board.filter(s => s.type === 'util').map(s => s.id);

    // Board-level "modules" (World Cup relocating multiplier, Free-Parking
    // jackpot, …). Runtime state lives on the game and is broadcast in getState.
    this.moduleDefs = Array.isArray(def.modules) ? def.modules : [];
    this.initModules();
    this.winner = null;
    this.winnerTeam = null;
    this.turnPhase = 'ROLL'; // ROLL, ACTION, END
    this.lastRoll = null;
    this.rollId = null;
    this.currentRollDouble = false;
    this.doublesCount = 0;
    this.logs = [];
    this.activeCard = null; // { deck, cardId, drawId, pid } for the client card popup

    const decks = def.decks || { chance: DEFAULT_CHANCE, chest: DEFAULT_CHEST };
    this.chanceDeck = shuffle(decks.chance);
    this.chestDeck = shuffle(decks.chest);
  }

  // Build the runtime board from a definition: id is normalised to the tile's
  // index, and ownable tiles get their mutable runtime fields.
  buildBoard(def) {
    return def.tiles.map((t, i) => {
      const tile = { ...t, id: i };
      if (t.type === 'property' || t.type === 'rail' || t.type === 'util') {
        tile.owner = null;
        tile.mortgaged = false;
      }
      if (t.type === 'property') tile.houses = 0;
      return tile;
    });
  }

  // ---- teams ------------------------------------------------------------

  // True when a and b are allies in 2v2 (so no rent flows between them).
  sameTeam(a, b) {
    if (this.teamMode !== '2v2') return false;
    const ta = this.playerStates[a] && this.playerStates[a].team;
    const tb = this.playerStates[b] && this.playerStates[b].team;
    return ta != null && ta === tb;
  }

  // ---- board modules ----------------------------------------------------

  ownableIds() {
    return this.board.filter(s => s.type === 'property' || s.type === 'rail' || s.type === 'util').map(s => s.id);
  }

  initModules() {
    this.worldCup = null;
    this.jackpot = null;
    this.auctionEnabled = false;
    const ownable = this.ownableIds();
    for (const m of this.moduleDefs) {
      if (!m) continue;
      if (m.type === 'worldCup') {
        const start = Number.isInteger(m.startTile) && ownable.includes(m.startTile) ? m.startTile : (ownable.length ? ownable[0] : null);
        if (start != null) this.worldCup = { hostTileId: start, level: 2, step: m.multiplierStep > 0 ? m.multiplierStep : 1 };
      } else if (m.type === 'jackpot') {
        this.jackpot = { pot: 0 };
      } else if (m.type === 'auction') {
        this.auctionEnabled = true; // interactive auction handled separately
      }
    }
  }

  // Move the World Cup marker one ownable tile forward and grow its multiplier.
  relocateWorldCup(byPid) {
    if (!this.worldCup) return;
    const ownable = this.ownableIds();
    if (!ownable.length) return;
    const cur = ownable.indexOf(this.worldCup.hostTileId);
    this.worldCup.hostTileId = ownable[(cur + 1) % ownable.length];
    this.worldCup.level += this.worldCup.step;
    this.log('world_cup_move', { pid: byPid, spaceId: this.worldCup.hostTileId, level: this.worldCup.level });
  }

  // ---- player lifecycle -------------------------------------------------

  addPlayer(steamId, meta = {}) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (this.players.includes(steamId)) return false;
    const idx = this.players.length;
    this.players.push(steamId);
    this.playerStates[steamId] = {
      position: this.roles.go,
      money: this.startingMoney,
      jailed: false,
      jailTurns: 0,
      jailCards: 0,
      skipNext: false,
      bankrupt: false,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      token: idx % PLAYER_COLORS.length,
      isBot: !!meta.isBot || steamId.startsWith('BOT_'),
      name: meta.name || null,
      team: meta.team != null ? meta.team : null,
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

    if (this.status === 'PLAYING' && this.teamMode === '2v2') {
      // A team wins once the opposing team has no solvent players left.
      const teamsLeft = new Set(this.players.map(p => this.playerStates[p] && this.playerStates[p].team));
      if (teamsLeft.size <= 1) {
        this.status = 'FINISHED';
        this.winner = this.players[0] || null;
        this.winnerTeam = this.winner != null ? this.playerStates[this.winner].team : null;
        if (this.winner) this.log('win', { pid: this.winner });
        return;
      }
    } else if (this.status === 'PLAYING' && this.players.length < 2) {
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
    // In 2v2, interleave the seating so teams alternate (A, B, A, B).
    if (this.teamMode === '2v2') {
      const t0 = this.players.filter(p => this.playerStates[p].team === 0);
      const t1 = this.players.filter(p => this.playerStates[p].team === 1);
      const inter = [];
      for (let i = 0; i < Math.max(t0.length, t1.length); i++) {
        if (t0[i]) inter.push(t0[i]);
        if (t1[i]) inter.push(t1[i]);
      }
      if (inter.length === this.players.length) this.players = inter;
    }
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
    else if (!creditor && this.jackpot) this.jackpot.pot += amount; // fees/taxes feed the pot
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
    // A "skip turn" POI effect makes a player miss their next turn.
    const pid = this.players[this.currentTurnIndex];
    const ps = this.playerStates[pid];
    if (ps && ps.skipNext) {
      ps.skipNext = false;
      this.log('skip_turn', { pid });
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      return this.beginTurn(); // each skipped player clears its own flag → terminates
    }
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
    state.position = this.roles.jail;
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
      state.money += this.passGo;
      this.log('pass_go', { pid: steamId, amount: this.passGo });
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

    if (space.id === this.roles.goToJail) { this.sendToJail(steamId, 'space'); return; }

    // World Cup marker sits on an ownable tile: landing there charges boosted
    // rent, then the marker relocates and its multiplier grows.
    const wcHere = !!(this.worldCup && space.id === this.worldCup.hostTileId);

    switch (space.type) {
      case 'property':
      case 'rail':
      case 'util': {
        if (space.owner == null) {
          this.turnPhase = 'ACTION';
        } else if (space.owner !== steamId && !space.mortgaged && !this.sameTeam(steamId, space.owner)) {
          const total = opts.diceTotal != null ? opts.diceTotal
            : (this.lastRoll ? this.lastRoll[0] + this.lastRoll[1] : 0);
          let rent = this.getRent(space, opts.utilForceTotal != null ? opts.utilForceTotal : total);
          if (opts.rentMultiplier) rent *= opts.rentMultiplier;
          if (wcHere) rent = Math.round(rent * this.worldCup.level);
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
      case 'special':
        this.applySpecial(steamId, space.effect || { type: 'safe' }, opts);
        break;
      default: // GO, Jail (visiting), Free Parking
        // Free-Parking jackpot: landing scoops the accumulated pot.
        if (space.id === this.roles.freeParking && this.jackpot && this.jackpot.pot > 0) {
          const amt = this.jackpot.pot;
          this.jackpot.pot = 0;
          this.credit(steamId, amt);
          this.log('jackpot_win', { pid: steamId, amount: amt });
        }
        this.endOrRoll(steamId);
    }

    // Marker moves after the landing it affected is resolved.
    if (wcHere && this.worldCup) this.relocateWorldCup(steamId);
  }

  // Predefined POI effects (data-driven "custom rules").
  applySpecial(steamId, eff, opts = {}) {
    const state = this.playerStates[steamId];
    if (!state) return;
    this.log('special', { pid: steamId, spaceId: state.position, effect: eff.type, amount: eff.amount });
    switch (eff.type) {
      case 'reward': this.credit(steamId, eff.amount || 0); this.endOrRoll(steamId); break;
      case 'fee': this.charge(steamId, eff.amount || 0, null); this.endOrRoll(steamId); break;
      case 'collectAll':
        for (const p of this.players) if (p !== steamId) this.charge(p, eff.amount || 0, steamId);
        this.endOrRoll(steamId); break;
      case 'payAll':
        for (const p of [...this.players]) { if (p !== steamId) this.charge(steamId, eff.amount || 0, p); if (!this.playerStates[steamId]) return; }
        this.endOrRoll(steamId); break;
      case 'teleport': {
        const tgt = ((Number.isInteger(eff.target) ? eff.target : 0) % this.board.length + this.board.length) % this.board.length;
        state.position = tgt;
        if (!opts._tp) this.resolveLanding(steamId, { _tp: true }); else this.endOrRoll(steamId);
        break;
      }
      case 'jail': this.sendToJail(steamId, 'special'); break;
      case 'extraRoll': this.turnPhase = 'ROLL'; break;
      case 'skipTurn': state.skipNext = true; this.endOrRoll(steamId); break;
      case 'drawChance': this.drawCard(steamId, 'chance'); break;
      case 'drawChest': this.drawCard(steamId, 'chest'); break;
      case 'safe':
      default: this.endOrRoll(steamId);
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
    const N = this.board.length;
    let pos = state.position + move;
    if (pos >= N) {
      pos -= N;
      state.money += this.passGo;
      this.log('pass_go', { pid: steamId, amount: this.passGo });
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
      case 'move_to_go':
        // Generalized "advance to GO" for non-classic decks: land on GO and
        // collect the GO salary.
        state.position = this.roles.go;
        this.credit(steamId, this.passGo);
        this.log('pass_go', { pid: steamId, amount: this.passGo });
        this.resolveLanding(steamId, { fromCard: true });
        break;
      case 'move_by': {
        const N = this.board.length;
        state.position = (state.position + card.steps + N) % N;
        this.resolveLanding(steamId, { fromCard: true });
        break;
      }
      case 'nearest_rail': {
        const target = this.railIndices.find(r => r > state.position);
        this.moveTo(steamId, target != null ? target : this.railIndices[0], { collectGo: true });
        this.resolveLanding(steamId, { fromCard: true, rentMultiplier: 2 });
        break;
      }
      case 'nearest_util': {
        const target = this.utilIndices.find(u => u > state.position);
        this.moveTo(steamId, target != null ? target : this.utilIndices[0], { collectGo: true });
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
      boardId: this.boardId,
      // Everything the client needs to render an arbitrary board with no prior
      // knowledge of it.
      boardMeta: {
        boardId: this.boardId,
        name: this.boardName,
        perSide: this.perSide,
        roles: this.roles,
        theme: this.theme,
        currency: this.currency,
        startingMoney: this.startingMoney,
        passGo: this.passGo,
        modules: this.moduleDefs,
      },
      moduleState: {
        worldCup: this.worldCup,
        jackpot: this.jackpot,
        auction: this.auction || null,
      },
      winner: this.winner,
      winnerTeam: this.winnerTeam,
      teamMode: this.teamMode,
      lastRoll: this.lastRoll,
      rollId: this.rollId,
      isDouble: this.currentRollDouble,
      activeCard: this.activeCard,
      logs: this.logs,
    };
  }
}

module.exports = MonopolyGame;
