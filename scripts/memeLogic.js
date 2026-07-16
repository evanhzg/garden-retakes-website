// Make It Meme — Server-Authoritative Game Logic

const MEME_TEMPLATES = [
  { id: 1, name: "Drake Hotline Bling", url: "https://i.imgflip.com/30b1gx.jpg", slots: 2 },
  { id: 2, name: "Two Buttons", url: "https://i.imgflip.com/1g8my4.jpg", slots: 2 },
  { id: 3, name: "Distracted Boyfriend", url: "https://i.imgflip.com/1ur9b0.jpg", slots: 3 },
  { id: 4, name: "Change My Mind", url: "https://i.imgflip.com/24y43o.jpg", slots: 1 },
  { id: 5, name: "Expanding Brain", url: "https://i.imgflip.com/1jwhww.jpg", slots: 4 },
  { id: 6, name: "Is This A Pigeon", url: "https://i.imgflip.com/1o00in.jpg", slots: 3 },
  { id: 7, name: "Surprised Pikachu", url: "https://i.imgflip.com/2kbn1e.jpg", slots: 1 },
  { id: 8, name: "Stonks", url: "https://i.imgflip.com/3pnmg2.jpg", slots: 1 },
  { id: 9, name: "One Does Not Simply", url: "https://i.imgflip.com/1bij.jpg", slots: 1 },
  { id: 10, name: "This Is Fine", url: "https://i.imgflip.com/wxica.jpg", slots: 1 },
];

const BOT_CAPTIONS = [
  "When the server admin is AFK",
  "Me pretending to be good at CS2",
  "The teammate who rushes B every round",
  "My aim vs my confidence",
  "Solo queue in a nutshell",
  "When you finally hit Global",
  "That one guy who never buys armor",
  "When the last update breaks everything",
  "My K/D ratio after a 10-game losing streak",
  "When you hear footsteps behind you",
  "The AWPer who misses every shot",
  "Your economy after force-buying every round",
  "When the bomb is planted and you have no kit",
  "Me: I'll just play one more game",
  "The callouts my team makes vs reality",
  "When you clutch a 1v5 but nobody was watching",
];

class MemeGame {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.status = 'WAITING';
    this.players = [];
    this.scores = {};
    this.round = 0;
    this.maxRounds = 5;
    this.currentTemplate = null;
    this.phase = 'CAPTION'; // CAPTION, VOTE, RESULTS
    this.submissions = {}; // playerId -> { captions: string[] }
    this.votes = {}; // voterId -> targetPlayerId
    this.roundResults = [];
    this.logs = [];
    this.templatePool = [];
  }

  addPlayer(playerId) {
    if (this.status !== 'WAITING' || this.players.length >= 8) return false;
    if (this.players.includes(playerId)) return false;
    this.players.push(playerId);
    this.scores[playerId] = 0;
    return true;
  }

  removePlayer(playerId) {
    if (this.status !== 'WAITING') return false;
    this.players = this.players.filter(p => p !== playerId);
    delete this.scores[playerId];
    return true;
  }

  start() {
    if (this.players.length < 3) return false;
    this.status = 'PLAYING';
    this.round = 0;
    this.scores = {};
    this.players.forEach(p => this.scores[p] = 0);
    this.templatePool = [...MEME_TEMPLATES].sort(() => Math.random() - 0.5);
    this.logs = [];
    this._startRound();
    return true;
  }

  _startRound() {
    this.round++;
    if (this.round > this.maxRounds || this.templatePool.length === 0) {
      this._endGame();
      return;
    }

    this.currentTemplate = this.templatePool.pop();
    this.submissions = {};
    this.votes = {};
    this.roundResults = [];
    this.phase = 'CAPTION';
    this.logs.push({ id: Date.now(), text: `Round ${this.round}: "${this.currentTemplate.name}"` });
  }

  submitCaption(playerId, captions) {
    if (this.status !== 'PLAYING' || this.phase !== 'CAPTION') return false;
    if (!this.players.includes(playerId)) return false;
    if (this.submissions[playerId]) return false;
    if (!Array.isArray(captions) || captions.length === 0) return false;

    this.submissions[playerId] = { captions: captions.slice(0, this.currentTemplate.slots) };

    if (this.players.every(p => this.submissions[p])) {
      this._startVoting();
    }
    return true;
  }

  _startVoting() {
    this.phase = 'VOTE';
    this.votes = {};
    this.roundResults = Object.entries(this.submissions).map(([pid, sub]) => ({
      playerId: pid,
      captions: sub.captions,
      voteCount: 0,
    }));
    this.roundResults.sort(() => Math.random() - 0.5); // Shuffle for anonymity
    this.logs.push({ id: Date.now(), text: 'All captions submitted! Vote for the best one.' });
  }

  vote(playerId, targetPlayerId) {
    if (this.status !== 'PLAYING' || this.phase !== 'VOTE') return false;
    if (!this.players.includes(playerId)) return false;
    if (targetPlayerId === playerId) return false; // Can't vote for yourself
    if (this.votes[playerId]) return false;

    this.votes[playerId] = targetPlayerId;

    if (Object.keys(this.votes).length >= this.players.length) {
      this._tallyVotes();
    }
    return true;
  }

  _tallyVotes() {
    // Count votes
    for (const targetId of Object.values(this.votes)) {
      const entry = this.roundResults.find(r => r.playerId === targetId);
      if (entry) entry.voteCount++;
    }

    this.roundResults.sort((a, b) => b.voteCount - a.voteCount);
    
    // Award points
    if (this.roundResults.length > 0 && this.roundResults[0].voteCount > 0) {
      const winnerId = this.roundResults[0].playerId;
      this.scores[winnerId] += this.roundResults[0].voteCount;
      const name = winnerId.startsWith('BOT_') ? `Bot ${winnerId.slice(-4)}` : winnerId.slice(-4);
      this.logs.push({ id: Date.now(), text: `🏆 ${name} wins with ${this.roundResults[0].voteCount} votes!` });
    }

    this.phase = 'RESULTS';
  }

  nextRound(playerId) {
    if (this.phase !== 'RESULTS') return false;
    if (this.players[0] !== playerId) return false;
    this._startRound();
    return true;
  }

  _endGame() {
    this.status = 'FINISHED';
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const name = sorted[0][0].startsWith('BOT_') ? `Bot ${sorted[0][0].slice(-4)}` : sorted[0][0].slice(-4);
      this.logs.push({ id: Date.now(), text: `🎉 Game over! ${name} wins with ${sorted[0][1]} points!` });
    }
  }

  resetToLobby() {
    this.status = 'WAITING';
    this.submissions = {};
    this.votes = {};
    this.roundResults = [];
    this.currentTemplate = null;
    this.logs = [];
    return true;
  }

  getState() {
    return {
      lobbyId: this.lobbyId,
      status: this.status,
      players: this.players,
      scores: this.scores,
      round: this.round,
      maxRounds: this.maxRounds,
      currentTemplate: this.currentTemplate,
      phase: this.phase,
      submittedPlayers: Object.keys(this.submissions),
      votedPlayers: Object.keys(this.votes),
      roundResults: this.phase === 'RESULTS' ? this.roundResults : this.roundResults.map(r => ({ ...r, playerId: undefined })),
      logs: this.logs.slice(-15),
    };
  }

  getStateForPlayer(playerId) {
    const state = this.getState();
    state.mySubmission = this.submissions[playerId] || null;
    // In results, reveal all playerIds
    if (this.phase === 'RESULTS') {
      state.roundResults = this.roundResults;
    }
    return state;
  }

  static getBotCaptions() {
    return BOT_CAPTIONS;
  }
}

module.exports = MemeGame;
