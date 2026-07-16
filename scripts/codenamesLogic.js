// Codenames Server-Authoritative Game Logic

const WORD_LIST = [
  // General words
  "APPLE", "BANK", "BRIDGE", "CASTLE", "DIAMOND", "EAGLE", "FIRE", "GHOST",
  "HONEY", "ICE", "JUNGLE", "KNIGHT", "LEMON", "MOON", "NINJA", "OCEAN",
  "PIANO", "QUEEN", "ROBOT", "SHADOW", "TIGER", "UMBRELLA", "VOLCANO", "WHALE",
  "YARD", "ZERO", "ANCHOR", "BLADE", "CROWN", "DRAGON", "ENGINE", "FALCON",
  "GARDEN", "HAMMER", "ISLAND", "JEWEL", "LASER", "MARBLE", "NEEDLE", "OLIVE",
  "PALACE", "RAVEN", "SNAKE", "TOWER", "VIRUS", "WIZARD", "ANGEL", "BOMB",
  "COPPER", "DUST", "ECLIPSE", "FOREST", "GLACIER", "HARBOR", "IVORY", "JAGUAR",
  "KITE", "LION", "MERCURY", "NORTH", "ORBIT", "PHOENIX", "RADAR", "SILK",
  "THRONE", "URANIUM", "VIPER", "WOLF", "CRYSTAL", "DESERT", "FLAME", "GRAPE",
  "HELMET", "INK", "JET", "KEY", "LOTUS", "MASK", "NET", "OAK",
  // CS2 themed
  "DUST2", "MIRAGE", "NUKE", "INFERNO", "OVERPASS", "ANUBIS", "VERTIGO", "ANCIENT",
  "SMOKE", "FLASH", "MOLOTOV", "GRENADE", "DEFUSE", "PLANT", "RUSH", "ROTATE",
  "CLUTCH", "PEEK", "BOOST", "STACK", "FLANK", "CAMP", "SPRAY", "BURST",
  "SCOPE", "RELOAD", "ARMOR", "HELMET", "AWPER", "ENTRY", "LURKER", "SUPPORT"
];

class CodenamesGame {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.status = 'WAITING'; // WAITING, PLAYING, FINISHED
    this.players = [];
    this.teams = { red: [], blue: [] };
    this.spymasters = { red: null, blue: null };
    this.board = [];
    this.revealed = [];
    this.currentTeam = 'red';
    this.phase = 'CLUE'; // CLUE, GUESS
    this.currentClue = null;
    this.guessesLeft = 0;
    this.winner = null;
    this.remaining = { red: 0, blue: 0 };
    this.logs = [];
  }

  addPlayer(playerId) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (this.players.includes(playerId)) return false;
    this.players.push(playerId);
    this._autoAssignTeams();
    return true;
  }

  removePlayer(playerId) {
    if (this.status !== 'WAITING') return false;
    this.players = this.players.filter(p => p !== playerId);
    this._autoAssignTeams();
    return true;
  }

  _autoAssignTeams() {
    this.teams = { red: [], blue: [] };
    this.spymasters = { red: null, blue: null };
    this.players.forEach((p, i) => {
      const team = i % 2 === 0 ? 'red' : 'blue';
      this.teams[team].push(p);
    });
    if (this.teams.red.length > 0) this.spymasters.red = this.teams.red[0];
    if (this.teams.blue.length > 0) this.spymasters.blue = this.teams.blue[0];
  }

  start() {
    if (this.players.length < 2) return false;
    this.status = 'PLAYING';
    this._generateBoard();
    this.currentTeam = 'red';
    this.phase = 'CLUE';
    this.winner = null;
    this.logs = [{ id: Date.now(), text: 'Game started! Red team gives the first clue.' }];
    return true;
  }

  _generateBoard() {
    const shuffled = [...WORD_LIST].sort(() => Math.random() - 0.5).slice(0, 25);
    const types = [];
    // Red goes first: 9 red, 8 blue, 7 neutral, 1 assassin
    for (let i = 0; i < 9; i++) types.push('red');
    for (let i = 0; i < 8; i++) types.push('blue');
    for (let i = 0; i < 7; i++) types.push('neutral');
    types.push('assassin');
    types.sort(() => Math.random() - 0.5);

    this.board = shuffled.map((word, i) => ({
      id: i,
      word,
      type: types[i],
    }));
    this.revealed = new Array(25).fill(false);
    this.remaining = { red: 9, blue: 8 };
  }

  giveClue(playerId, word, count) {
    if (this.status !== 'PLAYING' || this.phase !== 'CLUE') return false;
    if (this.spymasters[this.currentTeam] !== playerId) return false;
    if (!word || count < 0) return false;

    this.currentClue = { word: word.toUpperCase(), count };
    this.guessesLeft = count + 1; // +1 bonus guess
    this.phase = 'GUESS';

    const name = playerId.startsWith('BOT_') ? `Bot ${playerId.slice(-4)}` : playerId.slice(-4);
    this.logs.push({ id: Date.now(), text: `${this.currentTeam === 'red' ? '🔴' : '🔵'} Spymaster: "${word.toUpperCase()}" — ${count}` });
    return true;
  }

  guess(playerId, cardIndex) {
    if (this.status !== 'PLAYING' || this.phase !== 'GUESS') return false;
    const team = this.currentTeam;
    if (!this.teams[team].includes(playerId)) return false;
    if (this.spymasters[team] === playerId) return false;
    if (this.revealed[cardIndex]) return false;

    this.revealed[cardIndex] = true;
    const card = this.board[cardIndex];

    const name = playerId.startsWith('BOT_') ? `Bot ${playerId.slice(-4)}` : playerId.slice(-4);
    this.logs.push({ id: Date.now(), text: `${team === 'red' ? '🔴' : '🔵'} ${name} picked "${card.word}" — ${card.type.toUpperCase()}` });

    if (card.type === 'assassin') {
      this.winner = team === 'red' ? 'blue' : 'red';
      this.status = 'FINISHED';
      this.logs.push({ id: Date.now(), text: `💀 ASSASSIN! ${this.winner.toUpperCase()} team wins!` });
      return true;
    }

    if (card.type === 'red') this.remaining.red--;
    if (card.type === 'blue') this.remaining.blue--;

    if (this.remaining.red === 0) {
      this.winner = 'red';
      this.status = 'FINISHED';
      this.logs.push({ id: Date.now(), text: '🔴 RED team found all agents! RED wins!' });
      return true;
    }
    if (this.remaining.blue === 0) {
      this.winner = 'blue';
      this.status = 'FINISHED';
      this.logs.push({ id: Date.now(), text: '🔵 BLUE team found all agents! BLUE wins!' });
      return true;
    }

    if (card.type !== team) {
      this._endTurn();
      return true;
    }

    this.guessesLeft--;
    if (this.guessesLeft <= 0) {
      this._endTurn();
    }
    return true;
  }

  endGuessing(playerId) {
    if (this.status !== 'PLAYING' || this.phase !== 'GUESS') return false;
    if (!this.teams[this.currentTeam].includes(playerId)) return false;
    this._endTurn();
    return true;
  }

  _endTurn() {
    this.currentTeam = this.currentTeam === 'red' ? 'blue' : 'red';
    this.phase = 'CLUE';
    this.currentClue = null;
    this.guessesLeft = 0;
    this.logs.push({ id: Date.now(), text: `Turn passes to ${this.currentTeam === 'red' ? '🔴 RED' : '🔵 BLUE'} team.` });
  }

  resetToLobby() {
    this.status = 'WAITING';
    this.board = [];
    this.revealed = [];
    this.winner = null;
    this.logs = [];
    this._autoAssignTeams();
    return true;
  }

  getStateForPlayer(playerId) {
    const isSpymaster = this.spymasters.red === playerId || this.spymasters.blue === playerId;
    return {
      lobbyId: this.lobbyId,
      status: this.status,
      players: this.players,
      teams: this.teams,
      spymasters: this.spymasters,
      board: this.board.map((card, i) => ({
        ...card,
        type: (this.revealed[i] || isSpymaster) ? card.type : 'hidden',
      })),
      revealed: this.revealed,
      currentTeam: this.currentTeam,
      phase: this.phase,
      currentClue: this.currentClue,
      guessesLeft: this.guessesLeft,
      winner: this.winner,
      remaining: this.remaining,
      logs: this.logs.slice(-20),
    };
  }
}

module.exports = CodenamesGame;
