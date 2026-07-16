class MonopolyGame {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.players = []; 
    this.playerStates = {}; 
    this.status = 'WAITING';
    this.currentTurnIndex = 0;
    this.board = this.generateBoard();
    this.winner = null;
    this.turnPhase = 'ROLL'; // ROLL, ACTION, END
    this.lastRoll = null;
    this.rollId = null;
    this.doublesCount = 0;
    this.logs = [];
    this.playerColors = ['#ff3333', '#3366ff', '#33cc33', '#ffcc00'];
  }

  generateBoard() {
    return [
      { id: 0, name: 'GO', type: 'corner' },
      { id: 1, name: 'Med. Ave', type: 'property', group: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 2, name: 'Comm. Chest', type: 'chest' },
      { id: 3, name: 'Baltic Ave', type: 'property', group: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 4, name: 'Income Tax', type: 'tax', amount: 200 },
      { id: 5, name: 'Reading RR', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 6, name: 'Oriental Ave', type: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 7, name: 'Chance', type: 'chance' },
      { id: 8, name: 'Vermont Ave', type: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 9, name: 'Conn. Ave', type: 'property', group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50, houses: 0, mortgaged: false, owner: null },
      { id: 10, name: 'Jail', type: 'corner' },
      { id: 11, name: 'St. Charles', type: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 12, name: 'Electric Co', type: 'util', group: 'util', price: 150, mortgaged: false, owner: null },
      { id: 13, name: 'States Ave', type: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 14, name: 'Virginia Ave', type: 'property', group: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 15, name: 'Penn. RR', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 16, name: 'St. James', type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 17, name: 'Comm. Chest', type: 'chest' },
      { id: 18, name: 'Tennessee Ave', type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 19, name: 'New York Ave', type: 'property', group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, houses: 0, mortgaged: false, owner: null },
      { id: 20, name: 'Free Parking', type: 'corner' },
      { id: 21, name: 'Kentucky Ave', type: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 22, name: 'Chance', type: 'chance' },
      { id: 23, name: 'Indiana Ave', type: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 24, name: 'Illinois Ave', type: 'property', group: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 25, name: 'B. & O. RR', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 26, name: 'Atlantic Ave', type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 27, name: 'Ventnor Ave', type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 28, name: 'Water Works', type: 'util', group: 'util', price: 150, mortgaged: false, owner: null },
      { id: 29, name: 'Marvin Gardens', type: 'property', group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, houses: 0, mortgaged: false, owner: null },
      { id: 30, name: 'Go To Jail', type: 'corner' },
      { id: 31, name: 'Pacific Ave', type: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 32, name: 'N. Carolina', type: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 33, name: 'Comm. Chest', type: 'chest' },
      { id: 34, name: 'Penn. Ave', type: 'property', group: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 35, name: 'Short Line RR', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200], mortgaged: false, owner: null },
      { id: 36, name: 'Chance', type: 'chance' },
      { id: 37, name: 'Park Place', type: 'property', group: 'blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, houses: 0, mortgaged: false, owner: null },
      { id: 38, name: 'Luxury Tax', type: 'tax', amount: 100 },
      { id: 39, name: 'Boardwalk', type: 'property', group: 'blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, houses: 0, mortgaged: false, owner: null },
    ];
  }

  addPlayer(steamId) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (!this.players.includes(steamId)) {
      this.players.push(steamId);
      this.playerStates[steamId] = {
        position: 0, money: 1500, jailed: false, jailTurns: 0,
        color: this.playerColors[this.players.length - 1] || '#fff'
      };
    }
    return true;
  }

  removePlayer(steamId) {
    this.players = this.players.filter(p => p !== steamId);
    delete this.playerStates[steamId];
    
    // Return properties to bank
    for (const space of this.board) {
      if (space.owner === steamId) {
        space.owner = null;
        space.houses = 0;
        space.mortgaged = false;
      }
    }

    if (this.players.length < 2 && this.status === 'PLAYING') {
      this.status = 'FINISHED';
      this.winner = this.players[0] || null;
    }
  }

  log(msg) {
    this.logs.unshift({ id: Math.random().toString(36).substr(2, 9), text: msg });
    if (this.logs.length > 20) this.logs.pop();
  }

  start() {
    if (this.players.length < 2) return false;
    this.status = 'PLAYING';
    this.currentTurnIndex = Math.floor(Math.random() * this.players.length);
    this.log("Game started!");
    return true;
  }

  getRent(space, diceTotal) {
    if (space.mortgaged) return 0;
    if (space.type === 'rail') {
      const owned = this.board.filter(s => s.type === 'rail' && s.owner === space.owner).length;
      return space.rent[owned - 1];
    } else if (space.type === 'util') {
      const owned = this.board.filter(s => s.type === 'util' && s.owner === space.owner).length;
      return owned === 2 ? diceTotal * 10 : diceTotal * 4;
    } else {
      if (space.houses > 0) return space.rent[space.houses];
      // Check full group
      const groupProps = this.board.filter(s => s.group === space.group);
      const ownsAll = groupProps.every(s => s.owner === space.owner && !s.mortgaged);
      return ownsAll ? space.rent[0] * 2 : space.rent[0];
    }
  }

  drawCard(steamId, type) {
    const state = this.playerStates[steamId];
    const r = Math.random();
    if (r < 0.2) {
      this.log(`Card: Advance to GO! Collect $200.`);
      state.position = 0;
      state.money += 200;
    } else if (r < 0.4) {
      this.log(`Card: Go to Jail! Do not collect $200.`);
      state.position = 10;
      state.jailed = true;
      state.jailTurns = 0;
      this.turnPhase = 'END';
    } else if (r < 0.6) {
      this.log(`Card: Bank error in your favor. Collect $200.`);
      state.money += 200;
    } else if (r < 0.8) {
      this.log(`Card: Pay poor tax of $15.`);
      state.money -= 15;
    } else {
      this.log(`Card: You won a beauty contest! Collect $10.`);
      state.money += 10;
    }
  }

  rollDice(steamId) {
    if (this.status !== 'PLAYING') return false;
    const currentPlayer = this.players[this.currentTurnIndex];
    if (currentPlayer !== steamId) return false;
    if (this.turnPhase !== 'ROLL') return false;

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const isDouble = die1 === die2;
    this.lastRoll = [die1, die2];
    this.rollId = Math.random().toString(36).substr(2, 9);
    
    const state = this.playerStates[steamId];
    
    if (state.jailed) {
      if (isDouble) {
        state.jailed = false;
        state.jailTurns = 0;
        this.log(`Player rolled doubles and escaped jail!`);
      } else {
        state.jailTurns++;
        if (state.jailTurns >= 3) {
          state.money -= 50;
          state.jailed = false;
          state.jailTurns = 0;
          this.log(`Player paid $50 fine to leave jail after 3 turns.`);
        } else {
          this.turnPhase = 'END';
          this.log(`Player failed to roll doubles. Turn ends.`);
          return true;
        }
      }
    } else if (isDouble) {
      this.doublesCount++;
      if (this.doublesCount === 3) {
        state.position = 10;
        state.jailed = true;
        state.jailTurns = 0;
        this.doublesCount = 0;
        this.turnPhase = 'END';
        this.log(`Player rolled 3 doubles! Sent to Jail!`);
        return true;
      }
    }

    const move = die1 + die2;
    state.position += move;
    if (state.position >= 40) {
      state.position -= 40;
      state.money += 200;
      this.log(`Player passed GO, collected $200.`);
    }

    const space = this.board[state.position];
    this.log(`Player landed on ${space.name}.`);

    if (space.type === 'property' || space.type === 'rail' || space.type === 'util') {
      if (space.owner === null) {
        this.turnPhase = 'ACTION';
      } else if (space.owner !== steamId && !space.mortgaged) {
        const rent = this.getRent(space, move);
        state.money -= rent;
        this.playerStates[space.owner].money += rent;
        this.log(`Player paid $${rent} rent to ${space.owner.substring(0,4)}.`);
        this.turnPhase = isDouble ? 'ROLL' : 'END';
      } else {
        this.turnPhase = isDouble ? 'ROLL' : 'END';
      }
    } else if (space.type === 'tax') {
      state.money -= space.amount;
      this.log(`Player paid $${space.amount} tax.`);
      this.turnPhase = isDouble ? 'ROLL' : 'END';
    } else if (space.type === 'chance' || space.type === 'chest') {
      this.drawCard(steamId, space.type);
      if (state.jailed) this.turnPhase = 'END';
      else this.turnPhase = isDouble ? 'ROLL' : 'END';
    } else if (space.id === 30) { 
      state.position = 10;
      state.jailed = true;
      state.jailTurns = 0;
      this.log(`Player was sent to jail!`);
      this.turnPhase = 'END';
      this.doublesCount = 0;
    } else {
      this.turnPhase = isDouble ? 'ROLL' : 'END';
    }

    if (this.turnPhase === 'END' || this.turnPhase === 'ACTION') {
       if (!isDouble) this.doublesCount = 0;
    }

    return true;
  }

  buyProperty(steamId) {
    if (this.status !== 'PLAYING') return false;
    const currentPlayer = this.players[this.currentTurnIndex];
    if (currentPlayer !== steamId || this.turnPhase !== 'ACTION') return false;

    const state = this.playerStates[steamId];
    const space = this.board[state.position];

    if ((space.type === 'property' || space.type === 'rail' || space.type === 'util') && space.owner === null && state.money >= space.price) {
      state.money -= space.price;
      space.owner = steamId;
      this.log(`Player bought ${space.name}.`);
      this.turnPhase = this.lastRoll && this.lastRoll[0] === this.lastRoll[1] && this.doublesCount > 0 ? 'ROLL' : 'END';
      return true;
    }
    return false;
  }

  buildHouse(steamId, spaceId) {
    const space = this.board[spaceId];
    if (space.owner !== steamId || space.type !== 'property') return false;
    const state = this.playerStates[steamId];
    
    const groupProps = this.board.filter(s => s.group === space.group);
    const ownsAll = groupProps.every(s => s.owner === steamId);
    if (!ownsAll) return false;
    if (groupProps.some(s => s.mortgaged)) return false;
    if (space.houses >= 5) return false;
    if (state.money < space.houseCost) return false;

    const minHouses = Math.min(...groupProps.map(s => s.houses));
    if (space.houses > minHouses) return false;

    state.money -= space.houseCost;
    space.houses++;
    this.log(`Player built on ${space.name}.`);
    return true;
  }

  mortgageProperty(steamId, spaceId) {
    const space = this.board[spaceId];
    if (space.owner !== steamId) return false;
    if (space.houses > 0) return false; // Must sell houses first
    if (space.mortgaged) return false;

    space.mortgaged = true;
    this.playerStates[steamId].money += Math.floor(space.price / 2);
    this.log(`Player mortgaged ${space.name}.`);
    return true;
  }

  payJail(steamId) {
    const state = this.playerStates[steamId];
    if (!state.jailed || state.money < 50) return false;
    state.money -= 50;
    state.jailed = false;
    state.jailTurns = 0;
    this.log(`Player paid $50 to leave jail.`);
    return true;
  }

  endTurn(steamId) {
    if (this.status !== 'PLAYING') return false;
    const currentPlayer = this.players[this.currentTurnIndex];
    if (currentPlayer !== steamId) return false;
    if (this.turnPhase === 'ROLL' && !this.playerStates[steamId].jailed) return false; 
    
    // Check bankruptcy
    for (const p of [...this.players]) {
      if (this.playerStates[p].money < 0) {
        this.log(`Player ${p.substring(0,4)} went BANKRUPT!`);
        this.removePlayer(p);
      }
    }

    if (this.status === 'PLAYING') {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      this.turnPhase = 'ROLL';
      this.lastRoll = null;
      this.rollId = null;
      this.doublesCount = 0;
    }
    return true;
  }

  getState() {
    return {
      lobbyId: this.lobbyId,
      status: this.status,
      players: this.players,
      playerStates: this.playerStates,
      currentTurn: this.status === 'PLAYING' ? this.players[this.currentTurnIndex] : null,
      turnPhase: this.turnPhase,
      board: this.board,
      winner: this.winner,
      lastRoll: this.lastRoll,
      rollId: this.rollId,
      logs: this.logs
    };
  }
}

module.exports = MonopolyGame;
