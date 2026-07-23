const BOT_NAMES = [
  "Sprout", "Fern", "Clover", "Thorn", "Moss", "Petal", "Bramble", "Willow",
  "Sage", "Ivy", "Cactus", "Tulip", "Nettle", "Poppy", "Basil", "Daisy",
];

class UniversalLobby {
  constructor(id, hostSteamId, name, isPrivate, password) {
    this.id = id;
    this.host = hostSteamId;
    this.name = name;
    this.isPrivate = isPrivate;
    this.password = password;
    this.currentGame = 'none'; // e.g. 'uno_en', 'monopoly_fr' — 'none' when just hanging out
    this.selectedBoardId = 'classic'; // Monopoly board choice
    this.customBoardDef = null;        // set when a user-authored board is chosen
    this.status = 'WAITING'; // WAITING, PLAYING
    this.maxPlayers = 8;
    this.teamMode = 'ffa';   // 'ffa' | '2v2' (Monopoly allies mode)
    this.players = []; // Array of { steamId, ready, isBot, connected, team, botName? }
    this.chatHistory = []; // last 50 lobby messages, replayed to late joiners
    this.gameInstance = null;
    this.createdAt = Date.now();
  }

  addPlayer(steamId, isBot = false) {
    if (this.players.find(p => p.steamId === steamId)) return false;
    if (this.players.length >= this.maxPlayers) return false;
    const player = { steamId, ready: false, isBot, connected: true, team: null };
    if (isBot) {
      const used = new Set(this.players.filter(p => p.botName).map(p => p.botName));
      player.botName = BOT_NAMES.find(n => !used.has(n)) || `Bot ${steamId.slice(-4)}`;
    }
    this.players.push(player);
    if (this.teamMode === '2v2') this.assignTeam(player);
    return true;
  }

  // ---- teams (2v2) ----
  assignTeam(player) {
    const c0 = this.players.filter(p => p.team === 0).length;
    const c1 = this.players.filter(p => p.team === 1).length;
    player.team = c0 <= c1 ? 0 : 1;
  }

  autoAssignTeams() {
    this.players.forEach((p, i) => { p.team = i % 2; });
  }

  setTeamMode(mode) {
    this.teamMode = mode === '2v2' ? '2v2' : 'ffa';
    if (this.teamMode === '2v2') this.autoAssignTeams();
    else this.players.forEach(p => { p.team = null; });
    return true;
  }

  setPlayerTeam(steamId, team) {
    const p = this.getPlayer(steamId);
    if (!p || (team !== 0 && team !== 1)) return false;
    p.team = team;
    return true;
  }

  getPlayer(steamId) {
    return this.players.find(p => p.steamId === steamId) || null;
  }

  markConnected(steamId, connected) {
    const player = this.getPlayer(steamId);
    if (player) player.connected = connected;
    return !!player;
  }

  removePlayer(steamId) {
    const initialLength = this.players.length;
    this.players = this.players.filter(p => p.steamId !== steamId);

    if (this.players.length > 0 && this.host === steamId) {
      // Reassign host to the first connected human, else any human
      const nextHuman = this.players.find(p => !p.isBot && p.connected)
        || this.players.find(p => !p.isBot);
      if (nextHuman) {
        this.host = nextHuman.steamId;
      }
    }

    return this.players.length < initialLength;
  }

  toggleReady(steamId) {
    const player = this.getPlayer(steamId);
    if (player) {
      player.ready = !player.ready;
      return true;
    }
    return false;
  }

  pushChat(message) {
    this.chatHistory.push(message);
    if (this.chatHistory.length > 50) this.chatHistory.shift();
  }

  // Start rule (public and private alike): the host launches the game, and
  // every other connected human must have readied up first. Bots are always ready.
  canStart(requesterSteamId) {
    if (requesterSteamId !== this.host) return false;
    return this.players
      .filter(p => !p.isBot && p.connected && p.steamId !== this.host)
      .every(p => p.ready);
  }

  getPublicState() {
    return {
      id: this.id,
      host: this.host,
      name: this.name,
      isPrivate: this.isPrivate,
      currentGame: this.currentGame,
      selectedBoardId: this.selectedBoardId,
      customBoardName: this.customBoardDef ? this.customBoardDef.name : null,
      status: this.status,
      maxPlayers: this.maxPlayers,
      teamMode: this.teamMode,
      players: this.players,
      playerCount: this.players.length,
      createdAt: this.createdAt
    };
  }
}

module.exports = UniversalLobby;
