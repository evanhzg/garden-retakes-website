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
    this.status = 'WAITING'; // WAITING, PLAYING
    this.maxPlayers = 8;
    this.players = []; // Array of { steamId, ready, isBot, connected, botName? }
    this.chatHistory = []; // last 50 lobby messages, replayed to late joiners
    this.gameInstance = null;
    this.createdAt = Date.now();
  }

  addPlayer(steamId, isBot = false) {
    if (this.players.find(p => p.steamId === steamId)) return false;
    if (this.players.length >= this.maxPlayers) return false;
    const player = { steamId, ready: false, isBot, connected: true };
    if (isBot) {
      const used = new Set(this.players.filter(p => p.botName).map(p => p.botName));
      player.botName = BOT_NAMES.find(n => !used.has(n)) || `Bot ${steamId.slice(-4)}`;
    }
    this.players.push(player);
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
      status: this.status,
      maxPlayers: this.maxPlayers,
      players: this.players,
      playerCount: this.players.length,
      createdAt: this.createdAt
    };
  }
}

module.exports = UniversalLobby;
