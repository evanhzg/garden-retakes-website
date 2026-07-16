class UnoGame {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.players = []; // Array of steamIds
    this.deck = this.generateDeck();
    this.discardPile = [];
    this.hands = {}; // steamId -> array of cards
    this.currentTurnIndex = 0;
    this.direction = 1; // 1 for clockwise, -1 for counter-clockwise
    this.status = 'WAITING'; // WAITING, PLAYING, FINISHED
    this.currentColor = null;
    this.winner = null;
    
    this.modifiers = { stacking: false, sevenZero: false, jumpIn: false, team2v2: false, playOnDraw: true };
    this.drawPenalty = 0;

    this.calledUno = {};
    this.hasDrawnThisTurn = false;

    // Shuffle initial deck
    this.shuffle(this.deck);
  }

  generateDeck() {
    const colors = ['red', 'yellow', 'green', 'blue'];
    const deck = [];
    
    for (const color of colors) {
      deck.push({ color, value: '0', id: Math.random().toString(36).substr(2, 9) });
      for (let i = 1; i <= 9; i++) {
        deck.push({ color, value: i.toString(), id: Math.random().toString(36).substr(2, 9) });
        deck.push({ color, value: i.toString(), id: Math.random().toString(36).substr(2, 9) });
      }
      for (let i = 0; i < 2; i++) {
        deck.push({ color, value: 'skip', id: Math.random().toString(36).substr(2, 9) });
        deck.push({ color, value: 'reverse', id: Math.random().toString(36).substr(2, 9) });
        deck.push({ color, value: '+2', id: Math.random().toString(36).substr(2, 9) });
      }
    }
    for (let i = 0; i < 4; i++) {
      deck.push({ color: 'wild', value: 'color_picker', id: Math.random().toString(36).substr(2, 9) });
      deck.push({ color: 'wild', value: '+4', id: Math.random().toString(36).substr(2, 9) });
    }
    return deck;
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

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
    this.players = this.players.filter(p => p !== steamId);
    delete this.hands[steamId];
    delete this.calledUno[steamId];
    if (this.players.length === 0) {
      this.status = 'FINISHED';
    }
  }

  start() {
    if (this.players.length < 2) return false;
    
    // Deal 7 cards to everyone
    for (const steamId of this.players) {
      this.hands[steamId] = this.deck.splice(0, 7);
      this.calledUno[steamId] = false;
    }
    
    // Flip first card (must not be wild for simplicity)
    let firstCard = this.deck.pop();
    while (firstCard.color === 'wild') {
      this.deck.unshift(firstCard);
      firstCard = this.deck.pop();
    }
    this.discardPile.push(firstCard);
    this.currentColor = firstCard.color;
    
    this.status = 'PLAYING';
    this.currentTurnIndex = Math.floor(Math.random() * this.players.length);
    this.hasDrawnThisTurn = false;
    this.drawPenalty = 0;
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
    for (const p of this.players) {
      this.hands[p] = [];
      this.calledUno[p] = false;
    }
    return true;
  }

  callUno(steamId) {
    if (this.status !== 'PLAYING') return false;
    if (this.hands[steamId] && this.hands[steamId].length <= 2) {
      this.calledUno[steamId] = true;
      return true;
    }
    return false;
  }

  catchUno(callerId, targetId) {
    if (this.status !== 'PLAYING') return false;
    if (!this.players.includes(callerId) || !this.players.includes(targetId)) return false;

    // Check if target has 1 card and forgot to call UNO
    if (this.hands[targetId].length === 1 && !this.calledUno[targetId]) {
      // Caught! Target draws 2
      this.forceDraw(targetId, 2);
      return true;
    } else {
      // False catch! Caller draws 2
      this.forceDraw(callerId, 2);
      return false;
    }
  }

  forceDraw(steamId, count) {
    for (let k = 0; k < count; k++) {
      if (this.deck.length === 0) {
        if (this.discardPile.length <= 1) break;
        const topCard = this.discardPile.pop();
        this.deck = this.discardPile;
        this.shuffle(this.deck);
        this.discardPile = [topCard];
      }
      const card = this.deck.pop();
      if (card) {
        this.hands[steamId].push(card);
        this.calledUno[steamId] = false; // reset UNO status if they draw
      }
    }
  }

  drawCard(steamId) {
    if (this.status !== 'PLAYING') return null;
    if (this.players[this.currentTurnIndex] !== steamId) return null; // Not their turn
    if (this.hasDrawnThisTurn) return null; // Can't draw twice
    
    let drawCount = this.drawPenalty > 0 ? this.drawPenalty : 1;
    this.drawPenalty = 0;

    let drawnCards = [];
    for (let k = 0; k < drawCount; k++) {
      if (this.deck.length === 0) {
        const topCard = this.discardPile.pop();
        this.deck = this.discardPile;
        this.shuffle(this.deck);
        this.discardPile = [topCard];
      }
      
      const card = this.deck.pop();
      if (card) {
        this.hands[steamId].push(card);
        drawnCards.push(card);
        this.calledUno[steamId] = false; // Reset UNO call on draw
      }
    }
    
    if (this.modifiers.playOnDraw && drawCount === 1) {
      this.hasDrawnThisTurn = true;
    } else {
      this.nextTurn();
    }
    
    return drawnCards.length > 0 ? drawnCards[0] : null;
  }

  passTurn(steamId) {
    if (this.status !== 'PLAYING') return false;
    if (this.players[this.currentTurnIndex] !== steamId) return false;
    if (this.hasDrawnThisTurn) {
      this.nextTurn();
      return true;
    }
    return false;
  }

  playCard(steamId, cardId, declaredColor = null, targetSteamId = null) {
    if (this.status !== 'PLAYING') return false;

    const isTurn = this.players[this.currentTurnIndex] === steamId;
    const hand = this.hands[steamId];
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = hand[cardIndex];
    const topCard = this.discardPile[this.discardPile.length - 1];

    let isJumpIn = false;
    if (!isTurn) {
      if (this.modifiers.jumpIn && card.color === topCard.color && card.value === topCard.value && card.color !== 'wild') {
        isJumpIn = true;
        this.currentTurnIndex = this.players.indexOf(steamId);
        this.hasDrawnThisTurn = false;
      } else {
        return false;
      }
    }

    if (this.drawPenalty > 0 && !isJumpIn) {
      if (this.modifiers.stacking) {
        if (card.value !== topCard.value || (card.value !== '+2' && card.value !== '+4')) {
          return false;
        }
      } else {
        return false; // Should have drawn cards
      }
    } else if (!isJumpIn) {
      const isValid = card.color === 'wild' || card.color === this.currentColor || card.value === topCard.value;
      if (!isValid) return false;
    }

    // Apply play
    hand.splice(cardIndex, 1);
    this.discardPile.push(card);
    
    if (card.color === 'wild') {
      this.currentColor = declaredColor || 'red'; // default if they didn't pass one
    } else {
      this.currentColor = card.color;
    }

    // Check Win
    if (hand.length === 0) {
      this.status = 'FINISHED';
      this.winner = steamId;
      return true;
    }

    // Apply special card effects
    if (card.value === 'skip') {
      this.nextTurn();
    } else if (card.value === 'reverse') {
      this.direction *= -1;
      if (this.players.length === 2) {
        this.nextTurn();
      }
    } else if (card.value === '+2') {
      if (this.modifiers.stacking) {
        this.drawPenalty += 2;
      } else {
        this.nextTurn();
        const nextPlayer = this.players[this.currentTurnIndex];
        this.forceDraw(nextPlayer, 2);
      }
    } else if (card.value === '+4') {
      if (this.modifiers.stacking) {
        this.drawPenalty += 4;
      } else {
        this.nextTurn();
        const nextPlayer = this.players[this.currentTurnIndex];
        this.forceDraw(nextPlayer, 4);
      }
    } else if (card.value === '0' && this.modifiers.sevenZero) {
      const newHands = {};
      for (let i = 0; i < this.players.length; i++) {
        const currentP = this.players[i];
        let nextIndex = i + this.direction;
        if (nextIndex >= this.players.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = this.players.length - 1;
        const nextP = this.players[nextIndex];
        newHands[nextP] = this.hands[currentP];
      }
      this.hands = newHands;
    } else if (card.value === '7' && this.modifiers.sevenZero && targetSteamId && this.players.includes(targetSteamId)) {
      const temp = this.hands[steamId];
      this.hands[steamId] = this.hands[targetSteamId];
      this.hands[targetSteamId] = temp;
    }

    this.nextTurn();
    return true;
  }

  nextTurn() {
    this.currentTurnIndex += this.direction;
    if (this.currentTurnIndex >= this.players.length) {
      this.currentTurnIndex = 0;
    } else if (this.currentTurnIndex < 0) {
      this.currentTurnIndex = this.players.length - 1;
    }
    this.hasDrawnThisTurn = false;
  }

  getStateForPlayer(steamId) {
    const opponents = {};
    for (const p of this.players) {
      if (p !== steamId) {
        opponents[p] = {
          count: this.hands[p] ? this.hands[p].length : 0,
          calledUno: this.calledUno[p] || false,
          // If we wanted to reveal cards for teammates in 2v2:
          // cards: this.modifiers.team2v2 && isTeammate ? this.hands[p] : []
        };
      }
    }

    return {
      lobbyId: this.lobbyId,
      status: this.status,
      players: this.players,
      currentTurn: this.status === 'PLAYING' ? this.players[this.currentTurnIndex] : null,
      direction: this.direction,
      topCard: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null,
      currentColor: this.currentColor,
      hand: this.hands[steamId] || [],
      opponents,
      winner: this.winner,
      modifiers: this.modifiers,
      drawPenalty: this.drawPenalty,
      hasDrawnThisTurn: this.status === 'PLAYING' && this.players[this.currentTurnIndex] === steamId ? this.hasDrawnThisTurn : false,
      calledUno: this.calledUno[steamId] || false
    };
  }
}

module.exports = UnoGame;
