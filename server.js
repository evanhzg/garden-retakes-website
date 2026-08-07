const { createServer } = require("http");
const next = require("next");
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const nextHandler = nextApp.getRequestHandler();
const crypto = require("crypto");
const { Server } = require("socket.io");
const UnoGame = require("./scripts/unoLogic");
const MonopolyGame = require("./scripts/monopolyLogic");
const { BOARDS, getBoard, boardSummaries, validateBoard } = require("./scripts/boardDefs");

const { scrapeAll } = require('./scripts/scrapeMeta');
const CodenamesGame = require("./scripts/codenamesLogic");
const CahGame = require("./scripts/cahLogic");
const MemeGame = require("./scripts/memeLogic");
const pkmnBattleManager = require("./scripts/pkmnBattleManager");
const { ITEMS, maxHpForMon, parseInv, buildBagList } = require("./scripts/pkmnItems");
const SkribblGame = require("./scripts/skribblLogic");
const HeadshotGame = require("./scripts/headshotLogic");
const PentakillGame = require("./scripts/pentakillLogic");
const BuildPathGame = require("./scripts/buildpathLogic");
const BuyMenuGame = require("./scripts/buymenuLogic");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Verifies a short-lived realtime ticket issued by GET /api/pkmn/v1/realtime/connect-info
// (lib/pkmnAuth.ts: issueRealtimeTicket). Mirrors that file's signing scheme
// (domain-tagged HMAC-SHA256 over "pkmn_ticket:<body>") without importing it,
// since this file runs outside the Next build as a plain Node process.
// AUTH_SECRET reaches process.env here as a side effect of `new PrismaClient()`
// above (Prisma's generated client loads the project .env on init) — there is
// no explicit dotenv usage in this file.
function verifyPkmnTicket(ticket) {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret || typeof ticket !== "string") return null;
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", authSecret).update(`pkmn_ticket:${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload.steamId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload.steamId;
  } catch {
    return null;
  }
}

const httpServer = createServer();

// Allowed browser origins. Override/extend with SOCKET_CORS_ORIGINS (comma-separated).
const corsOrigins = process.env.SOCKET_CORS_ORIGINS
  ? process.env.SOCKET_CORS_ORIGINS.split(",").map((o) => o.trim())
  : [
      "https://retakes.fr",
      "https://www.retakes.fr",
      "https://games.retakes.fr",
      "https://pkmn.retakes.fr",
      "https://docs.retakes.fr",
      // Preview / dev environment
      "https://dev.retakes.fr",
      "https://games.dev.retakes.fr",
      "https://pkmn.dev.retakes.fr",
      "https://docs.dev.retakes.fr",
      // Local dev
      "http://localhost:3000",
      "http://games.localhost:3000",
      "http://pkmn.localhost:3000",
      "http://docs.localhost:3000",
      "http://localhost:3131",
      "http://games.localhost:3131",
      "http://pkmn.localhost:3131",
      "http://docs.localhost:3131",
    ];

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"]
  }
});

// SteamID -> Socket ID mapping for presence
const connectedUsers = new Map();

// Competitive retakes: parties, 2v2/3v3 queues, accept window and map veto.
// Registers its own `rq:`-namespaced connection handler against the same io,
// so it shares presence but cannot collide with the mini-game lobby events.
const { attachRetakesMatchmaking } = require('./scripts/retakesMatchmaking');

const UniversalLobby = require('./scripts/universalLobby');
const universalLobbies = new Map(); // lobbyId -> UniversalLobby
const lobbyCleanupTimers = new Map(); // lobbyId -> timeout handle for grace period deletion
const playerDisconnectTimers = new Map(); // `${lobbyId}:${steamId}` -> timeout for player-level grace
// steamId -> { lobbyId, at }: the last lobby a player was in, for one-click rejoin
const recentLobbies = new Map();

// Active game instances (lobbyId -> GameInstance)

// Active OUNO Games: lobbyId -> UnoGame instance
const unoGames = new Map();
// lobbyId -> timeout fining whoever let their OUNO call window lapse
const unoWindowTimers = new Map();
const clearUnoWindowTimer = (lobbyId) => {
  const t = unoWindowTimers.get(lobbyId);
  if (t) clearTimeout(t);
  unoWindowTimers.delete(lobbyId);
};

// Active Monopoly Games: lobbyId -> MonopolyGame instance
const monopolyGames = new Map();
const codenamesGames = new Map();
// lobbyId -> the 1s ticker driving Codenames' clue/turn clocks and bot pacing
const codenamesTimers = new Map();
const clearCodenamesTimer = (lobbyId) => {
  const t = codenamesTimers.get(lobbyId);
  if (t) clearInterval(t);
  codenamesTimers.delete(lobbyId);
};
const cahGames = new Map();
const cahTimers = new Map();
const clearCahTimer = (lobbyId) => {
  const t = cahTimers.get(lobbyId);
  if (t) clearInterval(t);
  cahTimers.delete(lobbyId);
};
const memeGames = new Map();
// lobbyId -> the 1s ticker driving Make It Meme's caption/vote/results phases
const memeTimers = new Map();
const clearMemeTimer = (lobbyId) => {
  const t = memeTimers.get(lobbyId);
  if (t) clearInterval(t);
  memeTimers.delete(lobbyId);
};
const skribblGames = new Map();
const headshotGames = new Map();
// lobbyId -> the 1s ticker pacing HEADSHOT's bots and its per-pro clock
const headshotTimers = new Map();
const clearHeadshotTimer = (lobbyId) => {
  const t = headshotTimers.get(lobbyId);
  if (t) clearTimeout(t);
  headshotTimers.delete(lobbyId);
};
const pentakillGames = new Map();
// lobbyId -> the same ticker for PENTAKILL's race
const pentakillTimers = new Map();
const clearPentakillTimer = (lobbyId) => {
  const t = pentakillTimers.get(lobbyId);
  if (t) clearTimeout(t);
  pentakillTimers.delete(lobbyId);
};
// The two quizzes share one shape, so one map + one ticker helper covers both.
const quizGames = new Map();       // lobbyId -> QuizRace
const quizTimers = new Map();
const clearQuizTimer = (lobbyId) => {
  const t = quizTimers.get(lobbyId);
  if (t) clearTimeout(t);
  quizTimers.delete(lobbyId);
};
// lobbyId -> the 1s ticker driving Skribbl's round + between-turn countdowns
const skribblTimers = new Map();
const clearSkribblTimer = (lobbyId) => {
  const t = skribblTimers.get(lobbyId);
  if (t) clearTimeout(t);
  skribblTimers.delete(lobbyId);
};

// ==========================================
// GARDEN PKMN GLOBAL STATE
// ==========================================
const pkmnMaps = new Map(); // mapId -> { players: { steamId: { x, y, facing, steamId } }, npcs: { ... } }

const getPkmnMap = (mapId) => {
  if (!pkmnMaps.has(mapId)) {
    pkmnMaps.set(mapId, { 
      players: {},
      npcs: {
        npc_joey: { x: 320, y: 320, name: 'Youngster Joey', facing: 'down' }
      }
    });
  }
  return pkmnMaps.get(mapId);
};

const handlePkmnLeave = async (socket, io) => {
  if (socket.pkmnMap && socket.steamId) {
    const mapId = socket.pkmnMap;
    const mapState = getPkmnMap(mapId);
    const pData = mapState.players[socket.steamId];
    
    if (pData) {
      try {
        await prisma.pkmnTrainer.update({
          where: { SteamId: BigInt(socket.steamId) },
          data: {
            CurrentMap: mapId,
            PosX: Math.round(pData.x),
            PosY: Math.round(pData.y),
            Facing: pData.facing
          }
        });
      } catch(e) { console.error("Failed to save PKMN trainer state", e); }
      
      delete mapState.players[socket.steamId];
      io.to(`pkmn_map_${mapId}`).emit("pkmn_player_left", { steamId: socket.steamId });
      socket.leave(`pkmn_map_${mapId}`);
    }
    socket.pkmnMap = null;
  }
};

attachRetakesMatchmaking(io, {
  connectedUsers,
  prisma,
  /**
   * Competitive ratings for a set of players.
   *
   * Missing rows are simply absent rather than defaulted here — the
   * matchmaker treats anyone it has no rating for as a new player, which is
   * exactly what they are, and creating a row on lookup would put people in
   * the leaderboard for opening the page.
   */
  async loadRatings(steamIds) {
    const ids = (steamIds || []).filter((id) => /^\d{5,20}$/.test(String(id)));
    if (ids.length === 0) return {};
    const rows = await prisma.gardenCompetitiveRating.findMany({
      where: { SteamId: { in: ids.map((id) => BigInt(id)) } },
      select: { SteamId: true, Elo: true, MatchesPlayed: true },
    });
    return Object.fromEntries(
      rows.map((r) => [r.SteamId.toString(), { elo: r.Elo, matches: r.MatchesPlayed }])
    );
  },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // When a user authenticates with the websocket
  socket.on("authenticate", (data) => {
    // The standalone (Unity) client sends a signed ticket from
    // GET /api/pkmn/v1/realtime/connect-info — verified here, so the socket
    // server never has to trust a client-asserted steamId for it. The
    // browser mini-games (UNO, PKMN web client, ...) still send a raw
    // steamId from their own site session; that trust boundary is unchanged
    // for now (tracked as a follow-up — see the roadmap).
    const ticketSteamId = data?.ticket ? verifyPkmnTicket(data.ticket) : null;
    if (data?.ticket && !ticketSteamId) {
      socket.emit("auth_error", { message: "Invalid or expired connect ticket." });
      return;
    }
    const steamId = ticketSteamId || data?.steamId;
    if (steamId) {
      connectedUsers.set(steamId.toString(), socket.id);
      socket.steamId = steamId.toString();

      // Broadcast online status to others
      io.emit("user_online", { steamId: steamId.toString() });
      console.log(`User ${steamId} authenticated`);

      // Ack so clients can safely emit steamId-dependent events (lobby_join etc.)
      socket.emit("authenticated", { steamId: socket.steamId });

      // Send the current list of all online users to this user
      socket.emit("online_friends_sync", Array.from(connectedUsers.keys()));
    }
  });

  socket.on("get_online_users", () => {
    socket.emit("online_friends_sync", Array.from(connectedUsers.keys()));
  });

  // Relay notifications triggered by API
  socket.on("send_notification", (data) => {
    const { targetSteamId, notification } = data;
    const targetSocket = connectedUsers.get(targetSteamId.toString());
    if (targetSocket) {
      io.to(targetSocket).emit("notification", notification);
    }
  });

  // Lobby chat and direct messages
  socket.on("send_message", (data) => {
    // data: { type: 'lobby' | 'direct', to: string, content: string }
    if (data.type === 'direct') {
      const targetSocket = connectedUsers.get(data.to);
      if (targetSocket) {
        io.to(targetSocket).emit("new_message", {
          from: socket.steamId,
          content: data.content,
          type: 'direct'
        });
      }
    } else if (data.type === 'lobby' && socket.lobbyId) {
      io.to(`lobby_${socket.lobbyId}`).emit("new_message", {
        from: socket.steamId,
        content: data.content,
        type: 'lobby'
      });
    }
  });

  // Relay utility screenshot capture
  socket.on("capture_request", (data) => {
    // Website asking daemon to capture
    io.emit("capture_job", { steamId: socket.steamId, ...data });
  });

  socket.on("capture_result", (data) => {
    // Daemon giving preview URL to the user
    if (!data.steamId) return;
    const targetSocket = connectedUsers.get(data.steamId);
    if (targetSocket) {
      io.to(targetSocket).emit("capture_preview", data);
    }
  });

  // Game Lobby Logic
  socket.on("join_lobby", (data) => {
    const { lobbyId } = data;
    socket.join(`lobby_${lobbyId}`);
    socket.lobbyId = lobbyId;
    io.to(`lobby_${lobbyId}`).emit("player_joined", { steamId: socket.steamId });
    console.log(`${socket.steamId} joined lobby ${lobbyId}`);
  });

  socket.on("leave_lobby", () => {
    if (socket.lobbyId) {
      socket.leave(`lobby_${socket.lobbyId}`);
      io.to(`lobby_${socket.lobbyId}`).emit("player_left", { steamId: socket.steamId });
      socket.lobbyId = null;
    }
  });
  // (disconnect is handled once, further down, after the lobby logic.)
  // Generic game events
  socket.on("game_event", (data) => {
    if (socket.lobbyId) {
      io.to(`lobby_${socket.lobbyId}`).emit("game_update", data);
    }
  });

  // ==========================================
  // UNIVERSAL LOBBY LOGIC
  // ==========================================

  const broadcastPublicLobbies = () => {
    const publicLobbies = Array.from(universalLobbies.values())
      .filter(l => !l.isPrivate)
      .map(l => l.getPublicState());
    io.emit("public_lobbies_sync", publicLobbies);
  };

  const broadcastLobbyState = (lobbyId) => {
    const lobby = universalLobbies.get(lobbyId);
    if (lobby) {
      io.to(`lobby_${lobbyId}`).emit("lobby_state", lobby.getPublicState());
      broadcastPublicLobbies(); // Update counts for others
    }
  };

  // System chat messages are stored in lobby history so late joiners see them too.
  // `content` may contain "{player}"; clients replace it with `subject`'s display name.
  const lobbySystemMessage = (lobbyId, content, subject = null) => {
    const lobby = universalLobbies.get(lobbyId);
    if (!lobby) return;
    const msg = { from: "SYSTEM", content, subject, type: 'lobby', ts: Date.now() };
    lobby.pushChat(msg);
    io.to(`lobby_${lobbyId}`).emit("new_message", msg);
  };

  const scheduleLobbyCleanup = (lobbyId) => {
    if (lobbyCleanupTimers.has(lobbyId)) return;
    const timer = setTimeout(() => {
      const l = universalLobbies.get(lobbyId);
      lobbyCleanupTimers.delete(lobbyId);
      if (l && l.players.filter(p => !p.isBot).length === 0) {
        universalLobbies.delete(lobbyId);
        clearUnoWindowTimer(lobbyId);
        unoGames.delete(lobbyId);
        monopolyGames.delete(lobbyId);
        clearCodenamesTimer(lobbyId);
        codenamesGames.delete(lobbyId);
        clearCahTimer(lobbyId);
        cahGames.delete(lobbyId);
        clearMemeTimer(lobbyId);
        memeGames.delete(lobbyId);
        clearSkribblTimer(lobbyId);
        skribblGames.delete(lobbyId);
        clearHeadshotTimer(lobbyId);
        headshotGames.delete(lobbyId);
        clearPentakillTimer(lobbyId);
        pentakillGames.delete(lobbyId);
        clearQuizTimer(lobbyId);
        quizGames.delete(lobbyId);
        broadcastPublicLobbies();
      }
    }, 10000);
    lobbyCleanupTimers.set(lobbyId, timer);
  };

  const removePlayerFromLobby = (lobbyId, steamId, reason) => {
    const lobby = universalLobbies.get(lobbyId);
    if (!lobby) return;
    const removed = lobby.removePlayer(steamId);
    if (!removed) return;

    // Remove from any running game so turns don't hang on a ghost player
    if (lobby.status === 'PLAYING' && lobby.gameInstance?.removePlayer) {
      try { lobby.gameInstance.removePlayer(steamId); } catch (err) { /* game may not support it */ }
    }

    lobbySystemMessage(lobbyId, reason, steamId);

    if (lobby.players.filter(p => !p.isBot).length === 0) {
      scheduleLobbyCleanup(lobbyId);
      broadcastPublicLobbies();
    } else {
      broadcastLobbyState(lobbyId);
    }
  };

  socket.on("lobby_create", (data) => {
    if (!socket.steamId) return;
    const lobbyId = Math.random().toString(36).substr(2, 9);
    
    const lobby = new UniversalLobby(
      lobbyId,
      socket.steamId,
      data.name || `${socket.steamId}'s Lobby`,
      data.isPrivate || false,
      data.password || null
    );
    
    if (data.currentGame) {
      lobby.currentGame = data.currentGame;
    }
    
    lobby.addPlayer(socket.steamId, false);
    universalLobbies.set(lobbyId, lobby);
    
    socket.join(`lobby_${lobbyId}`);
    socket.lobbyId = lobbyId;
    recentLobbies.set(socket.steamId, { lobbyId, at: Date.now() });

    broadcastLobbyState(lobbyId);
  });

  socket.on("get_public_lobbies", () => {
    socket.emit("public_lobbies_sync", Array.from(universalLobbies.values())
      .filter(l => !l.isPrivate)
      .map(l => l.getPublicState())
    );
  });

  // Tell the hub whether the caller has a lobby to rejoin — one they're still a
  // member of, or one they recently left that's still alive and joinable.
  socket.on("get_my_lobby", () => {
    if (!socket.steamId) { socket.emit("my_lobby", null); return; }

    const asCard = (lobby, member) => ({
      lobbyId: lobby.id,
      name: lobby.name,
      currentGame: lobby.currentGame,
      status: lobby.status,
      playerCount: lobby.players.length,
      maxPlayers: lobby.maxPlayers,
      isPrivate: lobby.isPrivate,
      member,
    });

    // Still seated at a table (e.g. left the tab open elsewhere)?
    for (const lobby of universalLobbies.values()) {
      if (lobby.players.some(p => p.steamId === socket.steamId)) {
        socket.emit("my_lobby", asCard(lobby, true));
        return;
      }
    }

    // Recently left, but the lobby lives on (others still there) and has room.
    const rec = recentLobbies.get(socket.steamId);
    if (rec && Date.now() - rec.at < 30 * 60 * 1000) {
      const lobby = universalLobbies.get(rec.lobbyId);
      if (lobby && lobby.status !== 'PLAYING' && lobby.players.length < lobby.maxPlayers) {
        socket.emit("my_lobby", asCard(lobby, false));
        return;
      }
    }
    socket.emit("my_lobby", null);
  });

  socket.on("lobby_join", (data) => {
    if (!socket.steamId) {
      socket.emit("lobby_error", { message: "Not authenticated yet" });
      return;
    }
    const { lobbyId, password } = data;
    const lobby = universalLobbies.get(lobbyId);

    if (!lobby) {
      socket.emit("lobby_error", { message: "Lobby not found" });
      return;
    }

    const existing = lobby.getPlayer(socket.steamId);

    // Members reconnecting skip the password check (they already proved it once)
    if (!existing && lobby.isPrivate && lobby.password !== password) {
      socket.emit("lobby_error", { message: "Invalid password" });
      return;
    }

    if (existing) {
      // Reconnect: cancel the pending grace-removal, restore presence
      const graceKey = `${lobbyId}:${socket.steamId}`;
      if (playerDisconnectTimers.has(graceKey)) {
        clearTimeout(playerDisconnectTimers.get(graceKey));
        playerDisconnectTimers.delete(graceKey);
      }
      lobby.markConnected(socket.steamId, true);
    } else {
      if (lobby.status === 'PLAYING') {
        socket.emit("lobby_error", { message: "Game in progress — try again once the round ends" });
        return;
      }
      if (!lobby.addPlayer(socket.steamId, false)) {
        socket.emit("lobby_error", { message: "Lobby is full" });
        return;
      }
    }

    // Cancel any pending empty-lobby cleanup
    if (lobbyCleanupTimers.has(lobbyId)) {
      clearTimeout(lobbyCleanupTimers.get(lobbyId));
      lobbyCleanupTimers.delete(lobbyId);
    }

    // A lobby the bot spun up has no host until the first human opens the link.
    if (lobby.host === "PENDING" && !existing) lobby.host = socket.steamId;

    socket.join(`lobby_${lobbyId}`);
    socket.lobbyId = lobbyId;
    // Remember this so the hub can offer a one-click rejoin if they wander off.
    recentLobbies.set(socket.steamId, { lobbyId, at: Date.now() });

    // Replay recent chat to the joiner, then announce fresh joins only
    socket.emit("chat_history", lobby.chatHistory);
    if (!existing) {
      lobbySystemMessage(lobbyId, "{player} joined the lobby", socket.steamId);
    }

    broadcastLobbyState(lobbyId);

    // If a game is running, push its current state to the reconnecting player
    if (lobby.status === 'PLAYING' && lobby.currentGame !== 'none') {
      const baseGame = lobby.currentGame.split('_')[0];
      if (baseGame === 'uno') broadcastUnoState(lobbyId);
      if (baseGame === 'monopoly') broadcastMonopolyState(lobbyId);
      if (baseGame === 'codenames') broadcastCodenamesState(lobbyId);
      if (baseGame === 'cah') broadcastCahState(lobbyId);
      if (baseGame === 'meme') broadcastMemeState(lobbyId);
      if (baseGame === 'skribbl') broadcastSkribblState(lobbyId);
      if (baseGame === 'headshot') broadcastHeadshotState(lobbyId);
      if (baseGame === 'pentakill') broadcastPentakillState(lobbyId);
      if (baseGame === 'buildpath' || baseGame === 'buymenu') broadcastQuizState(lobbyId);
    }
  });

  socket.on("lobby_leave", () => {
    if (socket.lobbyId && socket.steamId) {
      const lobbyId = socket.lobbyId;
      socket.leave(`lobby_${lobbyId}`);
      socket.lobbyId = null;
      removePlayerFromLobby(lobbyId, socket.steamId, "{player} left the lobby");
    }
  });

  socket.on("lobby_ready", () => {
    if (socket.lobbyId && socket.steamId) {
      const lobby = universalLobbies.get(socket.lobbyId);
      if (lobby) {
        lobby.toggleReady(socket.steamId);
        broadcastLobbyState(lobby.id);
      }
    }
  });

  socket.on("lobby_change_game", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const lobby = universalLobbies.get(socket.lobbyId);
      if (lobby && lobby.host === socket.steamId) {
        lobby.currentGame = data.game;
        broadcastLobbyState(lobby.id);
      }
    }
  });

  // Built-in board summaries for the Monopoly board picker.
  socket.on("get_boards", () => {
    socket.emit("boards_list", boardSummaries());
  });

  // Full built-in board defs — templates for the board editor.
  socket.on("get_board_defs", () => {
    socket.emit("board_defs", Object.values(BOARDS));
  });

  // Host picks the Monopoly board (built-in by id, or a validated custom def).
  socket.on("lobby_select_board", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId) return;
    if (data && data.boardDef) {
      const v = validateBoard(data.boardDef);
      if (!v.ok) { socket.emit("lobby_toast", { message: `Invalid board: ${v.error}` }); return; }
      lobby.customBoardDef = data.boardDef;
      lobby.selectedBoardId = data.boardDef.id || 'custom';
    } else {
      lobby.customBoardDef = null;
      lobby.selectedBoardId = (data && data.boardId) || 'classic';
    }
    broadcastLobbyState(lobby.id);
  });

  // Host edits the OUNO house rules / optional cards. Kept on the lobby so
  // every player sees the ruleset they are readying up for.
  socket.on("lobby_set_uno_rules", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.unoRules = UnoGame.sanitizeRules({ ...lobby.unoRules, ...(data?.rules || {}) });
    lobby.unoExtras = UnoGame.sanitizeExtras({ ...lobby.unoExtras, ...(data?.extras || {}) });
    broadcastLobbyState(lobby.id);
  });

  // Host configures Make It Meme (rounds, timers, mode, packs) and imports
  // custom meme templates.
  socket.on("lobby_set_meme_options", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    if (data && data.options) {
      lobby.memeOptions = MemeGame.sanitizeOptions({
        ...lobby.memeOptions,
        ...data.options,
        packs: { ...(lobby.memeOptions && lobby.memeOptions.packs), ...(data.options.packs || {}) },
      });
    }
    if (data && Array.isArray(data.customTemplates)) {
      lobby.memeCustomTemplates = MemeGame.sanitizeCustomTemplates(data.customTemplates);
    }
    broadcastLobbyState(lobby.id);
  });

  // Host flips the lobby between public and private (with an optional password).
  // Lives on the lobby page now instead of a create-time popup.
  socket.on("lobby_set_privacy", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId) return;
    lobby.isPrivate = !!(data && data.isPrivate);
    if (lobby.isPrivate) {
      if (data && typeof data.password === "string") lobby.password = data.password.slice(0, 64) || null;
    } else {
      lobby.password = null;
    }
    broadcastLobbyState(lobby.id);
    broadcastPublicLobbies();
  });

  // Host configures PILE OF... (rounds, timer, custom cards).
  socket.on("lobby_set_cah_options", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.cahOptions = CahGame.sanitizeOptions({ ...lobby.cahOptions, ...(data && data.options) });
    broadcastLobbyState(lobby.id);
  });

  // Host configures CODENAMES (board size, word packs, assassins, timers and
  // the rule variants).
  socket.on("lobby_set_codenames_options", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.codenamesOptions = CodenamesGame.sanitizeOptions({
      ...lobby.codenamesOptions,
      ...(data && data.options),
      packs: { ...(lobby.codenamesOptions && lobby.codenamesOptions.packs), ...(data?.options?.packs || {}) },
    });
    broadcastLobbyState(lobby.id);
  });

  // Picking a Codenames colour: anyone may move themselves, the host may move
  // anyone (and seat the bots).
  socket.on("lobby_set_codenames_team", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.status === 'PLAYING') return;
    const target = (data && data.steamId) || socket.steamId;
    if (target !== socket.steamId && lobby.host !== socket.steamId) return;
    if (lobby.setCodenamesTeam(target, (data && data.team) || null)) broadcastLobbyState(lobby.id);
  });

  socket.on("lobby_set_codenames_spymaster", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.status === 'PLAYING') return;
    const target = (data && data.steamId) || socket.steamId;
    if (target !== socket.steamId && lobby.host !== socket.steamId) return;
    if (lobby.setCodenamesSpymaster(target)) broadcastLobbyState(lobby.id);
  });

  socket.on("lobby_shuffle_codenames_teams", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.players.forEach((p) => { p.cnTeam = null; p.cnSpymaster = false; });
    // Deal the seats out at random rather than in join order.
    const order = [...lobby.players].sort(() => Math.random() - 0.5);
    order.forEach((p, i) => { p.cnTeam = i % 2 === 0 ? 'red' : 'blue'; });
    lobby.autoAssignCodenames();
    broadcastLobbyState(lobby.id);
  });

  // Host configures HEADSHOT's race (score to reach, per-pro clock).
  socket.on("lobby_set_headshot_options", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.headshotOptions = HeadshotGame.sanitizeOptions({ ...lobby.headshotOptions, ...(data && data.options) });
    broadcastLobbyState(lobby.id);
  });

  // Host configures PENTAKILL's race (score to reach, per-champion clock).
  socket.on("lobby_set_pentakill_options", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.pentakillOptions = PentakillGame.sanitizeOptions({ ...lobby.pentakillOptions, ...(data && data.options) });
    broadcastLobbyState(lobby.id);
  });

  // Host configures a quiz race (difficulty, score to reach, per-question clock).
  socket.on("lobby_set_quiz_options", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.quizOptions = BuildPathGame.sanitizeOptions({ ...lobby.quizOptions, ...(data && data.options) });
    broadcastLobbyState(lobby.id);
  });

  // Host picks how many times each player draws in Skribbl.
  socket.on("lobby_set_skribbl_rounds", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    const n = Math.round(Number(data && data.rounds));
    if (!Number.isFinite(n)) return;
    lobby.skribblRounds = Math.min(8, Math.max(1, n));
    broadcastLobbyState(lobby.id);
  });

  // Host toggles Monopoly team mode (ffa / 2v2) and assigns players to teams.
  socket.on("lobby_set_team_mode", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    lobby.setTeamMode(data && data.mode);
    broadcastLobbyState(lobby.id);
  });

  socket.on("lobby_set_team", (data) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const lobby = universalLobbies.get(socket.lobbyId);
    if (!lobby || lobby.host !== socket.steamId || lobby.status === 'PLAYING') return;
    if (lobby.setPlayerTeam(data && data.steamId, data && data.team)) broadcastLobbyState(lobby.id);
  });

  socket.on("lobby_start_game", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const lobbyId = socket.lobbyId;
      const lobby = universalLobbies.get(lobbyId);
      if (!lobby || lobby.status === 'PLAYING') return;

      // Host launches; every other connected human must be ready
      if (!lobby.canStart(socket.steamId)) {
        socket.emit("lobby_toast", { message: "Waiting for everyone to ready up" });
        return;
      }
      if (lobby.currentGame === 'none') {
        socket.emit("lobby_toast", { message: "Pick a game first" });
        return;
      }

      // Extract base game and language from format like "uno_en"
      const baseGame = lobby.currentGame.split('_')[0];
      const lang = lobby.currentGame.split('_')[1] || 'en';

      // Initialize the specific game instance
      let gameInstance = null;
      switch (baseGame) {
        case 'uno':
          // Host-chosen house rules live on the lobby so every seat can see
          // them before the deal; `data` is accepted as a late override.
          gameInstance = new UnoGame(lobbyId, {
            lang,
            rules: { ...(lobby.unoRules || {}), ...(data?.rules || {}) },
            extras: { ...(lobby.unoExtras || {}), ...(data?.extras || {}) },
          });
          clearUnoWindowTimer(lobbyId);
          unoGames.set(lobbyId, gameInstance);
          break;
        case 'monopoly': {
          const boardDef = lobby.customBoardDef
            ? lobby.customBoardDef
            : getBoard(lobby.selectedBoardId || 'classic');
          if (lobby.teamMode === '2v2') {
            const t0 = lobby.players.filter(p => p.team === 0).length;
            const t1 = lobby.players.filter(p => p.team === 1).length;
            if (lobby.players.length !== 4 || t0 !== 2 || t1 !== 2) {
              socket.emit("lobby_toast", { message: "2v2 needs exactly 4 players, 2 per team" });
              return;
            }
          }
          gameInstance = new MonopolyGame(lobbyId, lang, boardDef, { teamMode: lobby.teamMode });
          monopolyGames.set(lobbyId, gameInstance);
          break;
        }
        case 'codenames':
          // Anyone who never picked a colour gets seated now, and each side is
          // guaranteed a spymaster before the key card is dealt.
          lobby.autoAssignCodenames();
          gameInstance = new CodenamesGame(lobbyId, {
            lang,
            options: { ...(lobby.codenamesOptions || {}), ...(data?.options || {}) },
          });
          clearCodenamesTimer(lobbyId);
          codenamesGames.set(lobbyId, gameInstance);
          break;
        case 'cah':
          gameInstance = new CahGame(lobbyId, {
            lang,
            options: { ...(lobby.cahOptions || {}), ...(data?.options || {}) },
          });
          clearCahTimer(lobbyId);
          cahGames.set(lobbyId, gameInstance);
          break;
        case 'meme':
          gameInstance = new MemeGame(lobbyId, {
            lang,
            options: { ...(lobby.memeOptions || {}), ...(data?.options || {}) },
            customTemplates: lobby.memeCustomTemplates || [],
          });
          clearMemeTimer(lobbyId);
          memeGames.set(lobbyId, gameInstance);
          break;
        case 'headshot':
          gameInstance = new HeadshotGame(lobbyId, {
            lang,
            options: { ...(lobby.headshotOptions || {}), ...(data?.options || {}) },
          });
          clearHeadshotTimer(lobbyId);
          headshotGames.set(lobbyId, gameInstance);
          break;
        case 'pentakill':
          gameInstance = new PentakillGame(lobbyId, {
            lang,
            options: { ...(lobby.pentakillOptions || {}), ...(data?.options || {}) },
          });
          clearPentakillTimer(lobbyId);
          pentakillGames.set(lobbyId, gameInstance);
          break;
        case 'buildpath':
        case 'buymenu': {
          const Quiz = baseGame === 'buildpath' ? BuildPathGame : BuyMenuGame;
          gameInstance = new Quiz(lobbyId, {
            lang,
            options: { ...(lobby.quizOptions || {}), ...(data?.options || {}) },
          });
          clearQuizTimer(lobbyId);
          quizGames.set(lobbyId, gameInstance);
          break;
        }
        case 'skribbl':
          gameInstance = new SkribblGame(lobbyId, lang);
          gameInstance.setRounds(lobby.skribblRounds ?? 3);
          clearSkribblTimer(lobbyId);
          skribblGames.set(lobbyId, gameInstance);
          break;
      }

      if (gameInstance) {
        // Add all lobby players to the game instance (bot names are passed
        // through so games that localize display names can use them).
        lobby.players.forEach(p => {
          gameInstance.addPlayer(p.steamId, {
            isBot: p.isBot,
            name: p.botName,
            // Codenames seats players by colour, everything else by 0/1 index.
            team: baseGame === 'codenames' ? p.cnTeam : p.team,
            spymaster: baseGame === 'codenames' ? !!p.cnSpymaster : false,
          });
        });

        lobby.status = 'PLAYING';
        lobby.gameInstance = gameInstance;
        broadcastLobbyState(lobbyId);

        // Start the game logic
        const success = gameInstance.start();
        if (success) {
          // Trigger the game-specific broadcast so clients get initial state
          if (baseGame === 'uno') broadcastUnoState(lobbyId);
          if (baseGame === 'monopoly') broadcastMonopolyState(lobbyId);
          if (baseGame === 'codenames') broadcastCodenamesState(lobbyId);
          if (baseGame === 'cah') broadcastCahState(lobbyId);
          if (baseGame === 'meme') broadcastMemeState(lobbyId);
          if (baseGame === 'skribbl') broadcastSkribblState(lobbyId);
          if (baseGame === 'headshot') broadcastHeadshotState(lobbyId);
          if (baseGame === 'pentakill') broadcastPentakillState(lobbyId);
          if (baseGame === 'buildpath' || baseGame === 'buymenu') broadcastQuizState(lobbyId);
        }
      }
    }
  });

  socket.on("lobby_return", () => {
    if (socket.lobbyId && socket.steamId) {
      const lobbyId = socket.lobbyId;
      const lobby = universalLobbies.get(lobbyId);
      if (lobby && lobby.host === socket.steamId) {
        lobby.status = 'WAITING';
        lobby.players.forEach(p => p.ready = false); // reset ready status
        
        // Cleanup old game instances
        clearUnoWindowTimer(lobbyId);
        unoGames.delete(lobbyId);
        monopolyGames.delete(lobbyId);
        clearCodenamesTimer(lobbyId);
        codenamesGames.delete(lobbyId);
        clearCahTimer(lobbyId);
        cahGames.delete(lobbyId);
        clearMemeTimer(lobbyId);
        memeGames.delete(lobbyId);
        clearSkribblTimer(lobbyId);
        skribblGames.delete(lobbyId);
        clearHeadshotTimer(lobbyId);
        headshotGames.delete(lobbyId);
        clearPentakillTimer(lobbyId);
        pentakillGames.delete(lobbyId);
        clearQuizTimer(lobbyId);
        quizGames.delete(lobbyId);
        lobby.gameInstance = null;

        broadcastLobbyState(lobbyId);
      }
    }
  });

  socket.on("disconnect", async () => {
    console.log(`Socket disconnected: ${socket.id}`);
    await handlePkmnLeave(socket, io);

    // Only run presence/lobby cleanup if this socket is still the user's
    // current one (a page navigation opens the new socket before the old
    // one necessarily finishes closing).
    const isCurrentSocket = socket.steamId && connectedUsers.get(socket.steamId) === socket.id;

    if (socket.lobbyId && socket.steamId) {
      const lobbyId = socket.lobbyId;
      const lobby = universalLobbies.get(lobbyId);
      const steamId = socket.steamId;
      if (lobby && lobby.getPlayer(steamId) && isCurrentSocket) {
        // Player-level grace: mark as reconnecting, only drop after 10s
        lobby.markConnected(steamId, false);
        broadcastLobbyState(lobbyId);

        const graceKey = `${lobbyId}:${steamId}`;
        if (playerDisconnectTimers.has(graceKey)) clearTimeout(playerDisconnectTimers.get(graceKey));
        const timer = setTimeout(() => {
          playerDisconnectTimers.delete(graceKey);
          const l = universalLobbies.get(lobbyId);
          const p = l?.getPlayer(steamId);
          if (p && !p.connected) {
            removePlayerFromLobby(lobbyId, steamId, "{player} left the lobby");
          }
        }, 10000);
        playerDisconnectTimers.set(graceKey, timer);
      }
    }

    if (isCurrentSocket) {
      connectedUsers.delete(socket.steamId);
      io.emit("user_offline", { steamId: socket.steamId });
      io.emit("online_friends_sync", Array.from(connectedUsers.keys()));
    }
  });

  socket.on("lobby_add_bot", () => {
    if (socket.lobbyId && socket.steamId) {
      const lobby = universalLobbies.get(socket.lobbyId);
      if (lobby && lobby.host === socket.steamId) {
        const botId = 'BOT_' + Math.floor(Math.random() * 100000);
        const success = lobby.addPlayer(botId, true);
        if (success) {
          // If a game is currently playing, we should add it to the active game too
          if (lobby.status === 'PLAYING' && lobby.gameInstance) {
            lobby.gameInstance.addPlayer(botId);
          }
          broadcastLobbyState(socket.lobbyId);
        }
      }
    }
  });

  // Host can kick anyone (bots or players). lobby_kick_bot kept as an alias.
  const handleKick = (targetId) => {
    if (!socket.lobbyId || !socket.steamId || !targetId) return;
    const lobbyId = socket.lobbyId;
    const lobby = universalLobbies.get(lobbyId);
    if (!lobby || lobby.host !== socket.steamId) return;
    if (targetId === socket.steamId) return; // use Leave instead
    if (!lobby.getPlayer(targetId)) return;

    // Tell the kicked player's client to bail out before removing them
    const targetSocketId = connectedUsers.get(targetId);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit("lobby_kicked", { lobbyId });
        targetSocket.leave(`lobby_${lobbyId}`);
        if (targetSocket.lobbyId === lobbyId) targetSocket.lobbyId = null;
      }
    }

    removePlayerFromLobby(lobbyId, targetId, "{player} was kicked from the lobby");
  };

  socket.on("lobby_kick", (targetId) => handleKick(typeof targetId === 'string' ? targetId : targetId?.steamId));
  socket.on("lobby_kick_bot", (botId) => handleKick(botId));

  // ==========================================
  // OUNO SPECIFIC LOGIC
  // ==========================================

  // The OUNO call window is a wall-clock deadline: whoever drops to one card
  // has `rules.callWindowMs` to shout before the table fines them. We keep one
  // timer per lobby, always aimed at the earliest pending deadline.
  const scheduleUnoWindows = (lobbyId) => {
    const prev = unoWindowTimers.get(lobbyId);
    if (prev) clearTimeout(prev);
    unoWindowTimers.delete(lobbyId);

    const game = unoGames.get(lobbyId);
    if (!game || game.status !== 'PLAYING') return;

    const deadline = game.nextUnoDeadline();
    if (deadline == null) return;

    const timer = setTimeout(() => {
      unoWindowTimers.delete(lobbyId);
      const g = unoGames.get(lobbyId);
      if (!g) return;
      if (g.resolveUnoWindows()) broadcastUnoState(lobbyId);
      else scheduleUnoWindows(lobbyId);
    }, Math.max(50, deadline - Date.now()));

    unoWindowTimers.set(lobbyId, timer);
  };

  // Bots shout OUNO most of the time, but not always — forgetting is what makes
  // the catch button worth watching for.
  const scheduleBotUnoCall = (game, lobbyId, botId) => {
    if (!game.hands[botId] || game.hands[botId].length !== 1) return;
    if (game.calledUno[botId]) return;
    if (Math.random() > 0.75) return; // this one forgot
    const delay = 500 + Math.random() * Math.min(2000, game.rules.callWindowMs * 0.5);
    setTimeout(() => {
      const g = unoGames.get(lobbyId);
      if (!g || g !== game || g.status !== 'PLAYING') return;
      if (!g.hands[botId] || g.hands[botId].length !== 1 || g.calledUno[botId]) return;
      g.callUno(botId);
      broadcastUnoState(lobbyId);
    }, delay);
  };

  const botPickTarget = (game, botId) => {
    const others = game.players.filter(p => p !== botId);
    if (others.length === 0) return null;
    return others.reduce((best, p) =>
      (game.hands[p]?.length ?? 99) < (game.hands[best]?.length ?? 99) ? p : best, others[0]);
  };

  const handleUnoBotTurn = (game, lobbyId) => {
    setTimeout(() => {
      if (game.status !== 'PLAYING') return;
      const currentBotId = game.players[game.currentTurnIndex];
      if (!currentBotId || !currentBotId.startsWith('BOT_')) return;

      // 1. Punish anyone still sitting silently on a single card.
      for (const p of game.players) {
        if (p === currentBotId) continue;
        if (game.hands[p]?.length === 1 && !game.calledUno[p] && game.unoDeadlines[p] != null) {
          if (Math.random() > 0.55) {
            game.catchUno(currentBotId, p);
            broadcastUnoState(lobbyId);
            return;
          }
        }
      }

      // 2. Call a suspicious +4 now and then.
      if (game.challenge && game.challenge.target === currentBotId && Math.random() > 0.65) {
        game.challengeDrawFour(currentBotId);
        broadcastUnoState(lobbyId);
        return;
      }

      const hand = game.hands[currentBotId];
      const topCard = game.discardPile[game.discardPile.length - 1];
      const randomColor = () => ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)];

      // Choose a colour it actually holds when throwing a wild.
      const bestColor = () => {
        const tally = { red: 0, yellow: 0, green: 0, blue: 0 };
        for (const c of hand) if (tally[c.color] != null) tally[c.color]++;
        const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        return best && best[1] > 0 ? best[0] : randomColor();
      };

      // Already drew this turn (Play-on-Draw): play the drawn card or pass.
      if (game.hasDrawnThisTurn) {
        const drawnCard = hand[hand.length - 1];
        if (drawnCard && game._matches(drawnCard, topCard)) {
          const declared = drawnCard.color === 'wild' ? bestColor() : null;
          const target = (drawnCard.value === 'swap' || (drawnCard.value === '7' && game.rules.sevenZero))
            ? botPickTarget(game, currentBotId) : null;
          game.playCard(currentBotId, drawnCard.id, declared, target);
          scheduleBotUnoCall(game, lobbyId, currentBotId);
        } else {
          game.passTurn(currentBotId);
        }
        broadcastUnoState(lobbyId);
        return;
      }

      // Pick a card: answer a pending draw stack if we must, else play the
      // highest-impact legal card we hold.
      const legal = game.drawPenalty > 0
        ? hand.filter(c => game._answersPenalty(c, topCard))
        : hand.filter(c => game._matches(c, topCard));

      const PRIORITY = { '+6': 0, '+4': 1, '+2': 2, skip_all: 3, skip: 4, reverse: 5, discard_all: 6, swap: 7, shuffle: 8 };
      legal.sort((a, b) => (PRIORITY[a.value] ?? 20) - (PRIORITY[b.value] ?? 20));
      const cardToPlay = legal[0] || null;

      if (cardToPlay) {
        const declaredColor = cardToPlay.color === 'wild' ? bestColor() : null;
        let targetId = null;
        if (cardToPlay.value === 'swap' || (cardToPlay.value === '7' && game.rules.sevenZero)) {
          targetId = botPickTarget(game, currentBotId);
        }
        game.playCard(currentBotId, cardToPlay.id, declaredColor, targetId);
        scheduleBotUnoCall(game, lobbyId, currentBotId);
      } else {
        game.drawCard(currentBotId);
      }

      broadcastUnoState(lobbyId);
    }, 1500);
  };

  const broadcastUnoState = (lobbyId) => {
    const game = unoGames.get(lobbyId);
    if (!game) return;

    // Fine anyone whose window lapsed while we weren't looking.
    game.resolveUnoWindows();

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const pSocketId = connectedUsers.get(p);
      if (pSocketId) io.to(pSocketId).emit("uno_state", game.getStateForPlayer(p));
    }

    scheduleUnoWindows(lobbyId);

    if (game.status === 'PLAYING' && game.players[game.currentTurnIndex]?.startsWith('BOT_')) {
      handleUnoBotTurn(game, lobbyId);
    }
  };

  const withUnoGame = (fn) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const game = unoGames.get(socket.lobbyId);
    if (!game) return;
    fn(game, socket.lobbyId);
  };

  socket.on("uno_play", (data) => {
    withUnoGame((game, lobbyId) => {
      if (game.playCard(socket.steamId, data?.cardId, data?.declaredColor, data?.targetId)) {
        broadcastUnoState(lobbyId);
      }
    });
  });

  socket.on("uno_draw", () => {
    withUnoGame((game, lobbyId) => {
      if (game.drawCard(socket.steamId)) broadcastUnoState(lobbyId);
    });
  });

  socket.on("uno_pass_turn", () => {
    withUnoGame((game, lobbyId) => {
      if (game.passTurn(socket.steamId)) broadcastUnoState(lobbyId);
    });
  });

  socket.on("uno_call_uno", () => {
    withUnoGame((game, lobbyId) => {
      const res = game.callUno(socket.steamId);
      // A rejected call still costs cards, so always resync the table.
      if (res.reason !== 'already_called') broadcastUnoState(lobbyId);
    });
  });

  socket.on("uno_catch_uno", (data) => {
    withUnoGame((game, lobbyId) => {
      game.catchUno(socket.steamId, data?.targetId);
      broadcastUnoState(lobbyId);
    });
  });

  socket.on("uno_challenge", () => {
    withUnoGame((game, lobbyId) => {
      const res = game.challengeDrawFour(socket.steamId);
      if (res.ok) broadcastUnoState(lobbyId);
    });
  });

  // ==========================================
  // MONOPOLY SPECIFIC LOGIC
  // ==========================================

  const handleMonopolyBotTurn = (game, lobbyId) => {
    setTimeout(() => {
      if (game.status !== 'PLAYING' || game.turnPhase === 'AUCTION') return;
      const currentBotId = game.players[game.currentTurnIndex];
      if (!currentBotId || !currentBotId.startsWith('BOT_')) return;

      if (game.turnPhase === 'ROLL') {
        const bs = game.playerStates[currentBotId];
        if (bs.jailed) {
          if (bs.jailCards > 0) game.useJailCard(currentBotId);
          else if (bs.money > 500) game.payJail(currentBotId);
        }
        game.rollDice(currentBotId);
      } else if (game.turnPhase === 'ACTION') {
        const state = game.playerStates[currentBotId];
        const space = game.board[state.position];
        if (space && (space.type === 'property' || space.type === 'rail' || space.type === 'util') && space.owner === null && state.money >= space.price) {
          game.buyProperty(currentBotId);
        } else {
          game.skipBuy(currentBotId);
        }
      } else if (game.turnPhase === 'END') {
        // Invest surplus cash into houses (evenly, keeping a cash buffer) so bot
        // games actually develop and reach a conclusion.
        let built = true, guard = 0;
        while (built && guard++ < 40 && game.playerStates[currentBotId].money > 350) {
          built = false;
          for (const s of game.board) {
            if (s.owner === currentBotId && s.type === 'property' && s.houses < 5) {
              if (game.buildHouse(currentBotId, s.id)) { built = true; break; }
            }
          }
        }
        game.endTurn(currentBotId);
      }

      broadcastMonopolyState(lobbyId);
    }, 2000);
  };

  // Drive a bot that is the active bidder in an auction.
  const handleMonopolyAuctionBot = (game, lobbyId) => {
    setTimeout(() => {
      if (game.status !== 'PLAYING' || game.turnPhase !== 'AUCTION' || !game.auction) return;
      const a = game.auction;
      const pid = a.activePid;
      if (!pid || !pid.startsWith('BOT_')) return;
      const st = game.playerStates[pid];
      // Value a tile up to ~65% of its price, keeping a cash buffer.
      const cap = Math.min(st.money - 100, Math.round((a.price || 0) * 0.65));
      const next = a.highBid + a.increment;
      if (next <= cap) game.auctionBid(pid, next);
      else game.auctionPass(pid);
      broadcastMonopolyState(lobbyId);
    }, 1200);
  };

  const broadcastMonopolyState = (lobbyId) => {
    const game = monopolyGames.get(lobbyId);
    if (!game) return;
    io.to(`lobby_${lobbyId}`).emit("monopoly_state", game.getState());

    if (game.status === 'PLAYING' && game.turnPhase !== 'AUCTION' && game.players[game.currentTurnIndex]?.startsWith('BOT_')) {
      handleMonopolyBotTurn(game, lobbyId);
    }
    if (game.status === 'PLAYING' && game.turnPhase === 'AUCTION' && game.auction && game.auction.activePid && game.auction.activePid.startsWith('BOT_')) {
      handleMonopolyAuctionBot(game, lobbyId);
    }
  };

  socket.on("monopoly_roll", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.rollDice(socket.steamId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_buy", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.buyProperty(socket.steamId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_end_turn", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.endTurn(socket.steamId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_build", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.buildHouse(socket.steamId, data.spaceId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_mortgage", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.mortgageProperty(socket.steamId, data.spaceId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_pay_jail", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.payJail(socket.steamId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_use_card", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.useJailCard(socket.steamId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_skip", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.skipBuy(socket.steamId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_bid", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.auctionBid(socket.steamId, data && data.amount)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_auction_pass", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.auctionPass(socket.steamId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_sell", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.sellHouse(socket.steamId, data.spaceId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  socket.on("monopoly_unmortgage", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const game = monopolyGames.get(socket.lobbyId);
      if (game && game.unmortgageProperty(socket.steamId, data.spaceId)) {
        broadcastMonopolyState(socket.lobbyId);
      }
    }
  });

  // ==========================================
  // CODENAMES
  // ==========================================
  // Each player gets their own view: only spymasters (and, once it's over,
  // everyone) see the key card, so state can't be read out of the socket.
  const broadcastCodenamesState = (lobbyId) => {
    const game = codenamesGames.get(lobbyId);
    if (!game) return;

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const sid = connectedUsers.get(p);
      if (sid) io.to(sid).emit("codenames_state", game.getStateForPlayer(p));
    }

    if (game.status !== 'PLAYING') { clearCodenamesTimer(lobbyId); return; }
    if (!codenamesTimers.has(lobbyId)) startCodenamesTimer(lobbyId);
  };

  // One ticker per lobby runs the clue/turn clocks and paces the bots — the
  // game exposes a cooldown so a bot table doesn't resolve in a single frame.
  const startCodenamesTimer = (lobbyId) => {
    clearCodenamesTimer(lobbyId);
    const tid = setInterval(() => {
      const g = codenamesGames.get(lobbyId);
      if (!g || g.status !== 'PLAYING') { clearCodenamesTimer(lobbyId); return; }

      let changed = g.tick();

      const pending = g.pendingBot();
      if (pending) {
        changed = (pending.action === 'clue'
          ? g.botGiveClue(pending.playerId)
          : g.botGuess(pending.playerId)) || changed;
      }

      if (changed || g.timeLeft != null) broadcastCodenamesState(lobbyId);
    }, 1000);
    codenamesTimers.set(lobbyId, tid);
  };

  socket.on("codenames_clue", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = codenamesGames.get(socket.lobbyId);
    if (g && g.giveClue(socket.steamId, d?.word, d?.count)) broadcastCodenamesState(socket.lobbyId);
    else socket.emit("codenames_reject", { reason: "clue" });
  });

  socket.on("codenames_guess", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = codenamesGames.get(socket.lobbyId);
    if (g && g.guess(socket.steamId, d?.cardIndex)) broadcastCodenamesState(socket.lobbyId);
  });

  socket.on("codenames_end_guessing", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = codenamesGames.get(socket.lobbyId);
    if (g && g.endGuessing(socket.steamId)) broadcastCodenamesState(socket.lobbyId);
  });

  // ==========================================
  // CARDS AGAINST HUMANITY
  // ==========================================
  
  const formatCustomCard = async (text, lang = 'en') => {
    if (!text) return text;
    let formatted = text.trim();
    if (formatted.length > 0) formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    if (formatted.length > 0 && !/[.!?]$/.test(formatted)) formatted += '.';

    try {
      const params = new URLSearchParams({ text: formatted, language: lang === 'fr' ? 'fr' : 'en-US' });
      // We explicitly don't catch the rate limit issue if it happens, we just fallback.
      const res = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', body: params });
      if (res.ok) {
        const data = await res.json();
        const matches = data.matches || [];
        for (let i = matches.length - 1; i >= 0; i--) {
          const match = matches[i];
          if (match.replacements && match.replacements.length > 0) {
            formatted = formatted.substring(0, match.offset) + match.replacements[0].value + formatted.substring(match.offset + match.length);
          }
        }
      }
    } catch (err) {
      console.error('Spellcheck error:', err);
    }
    return formatted;
  };

  const broadcastCahState = (lobbyId) => {
    const game = cahGames.get(lobbyId);
    if (!game) return;

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const sid = connectedUsers.get(p);
      if (sid) io.to(sid).emit("cah_state", game.getStateForPlayer(p));
    }

    if (game.status !== 'PLAYING') { clearCahTimer(lobbyId); return; }
    if (!cahTimers.has(lobbyId)) startCahTimer(lobbyId);

    // Bots submit / judge on their own little timers.
    if (game.phase === 'SUBMIT' || game.phase === 'JUDGE') {
      game._botTimers = game._botTimers || {};
      for (const p of game.players) {
        if (!p.startsWith('BOT_')) continue;
        const isCzar = game.players[game.czarIndex] === p;
        const acted = game.phase === 'SUBMIT' ? (isCzar || game.submissions[p]) : (!isCzar);
        if (acted) continue;
        const key = `${p}:${game.phase}:${game.round}`;
        if (game._botTimers[key]) continue;
        const delay = game.phase === 'SUBMIT' ? 1500 + Math.random() * 4000 : 2000 + Math.random() * 3000;
        game._botTimers[key] = setTimeout(() => {
          delete game._botTimers[key];
          const g = cahGames.get(lobbyId);
          if (!g || g !== game || g.status !== 'PLAYING') return;
          g.botAct(p);
          broadcastCahState(lobbyId);
        }, delay);
      }
    }
  };

  const startCahTimer = (lobbyId) => {
    clearCahTimer(lobbyId);
    const tid = setInterval(() => {
      const g = cahGames.get(lobbyId);
      if (!g || g.status !== 'PLAYING') { clearCahTimer(lobbyId); return; }
      g.tick();
      broadcastCahState(lobbyId);
    }, 1000);
    cahTimers.set(lobbyId, tid);
  };

  socket.on("cah_start", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = cahGames.get(socket.lobbyId);
    if (g && g.players[0] === socket.steamId && g.start()) {
      startCahTimer(socket.lobbyId);
      broadcastCahState(socket.lobbyId);
    }
  });

  socket.on("cah_submit", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = cahGames.get(socket.lobbyId);
    if (g && g.submitCards(socket.steamId, d && d.cardIds)) broadcastCahState(socket.lobbyId);
  });

  socket.on("cah_submit_custom", async (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = cahGames.get(socket.lobbyId);
    if (!g || g.status !== 'PLAYING' || g.phase !== 'SUBMIT') return;
    const texts = Array.isArray(d && d.customTexts) ? d.customTexts : [];
    const formatted = await Promise.all(texts.map((t) => formatCustomCard(t, g.lang)));
    if (g.submitCustomCards(socket.steamId, formatted)) broadcastCahState(socket.lobbyId);
  });

  socket.on("cah_pick_winner", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = cahGames.get(socket.lobbyId);
    if (g && g.pickWinner(socket.steamId, d && d.winnerPlayerId)) broadcastCahState(socket.lobbyId);
  });

  socket.on("cah_next_round", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = cahGames.get(socket.lobbyId);
    if (g && g.nextRound(socket.steamId)) broadcastCahState(socket.lobbyId);
  });
  
  // ==========================================
  // MAKE IT MEME
  // ==========================================
  const broadcastMemeState = (lobbyId) => {
    const game = memeGames.get(lobbyId);
    if (!game) return;

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const sid = connectedUsers.get(p);
      if (sid) io.to(sid).emit("meme_state", game.getStateForPlayer(p));
    }

    if (game.status !== 'PLAYING') { clearMemeTimer(lobbyId); return; }
    if (!memeTimers.has(lobbyId)) startMemeTimer(lobbyId);

    // Bots caption / vote on their own timers so the round feels alive.
    if (game.phase === 'CAPTION' || game.phase === 'VOTE') {
      for (const p of game.players) {
        if (!p.startsWith('BOT_')) continue;
        const acted = game.phase === 'CAPTION' ? game.submissions[p] : game.votes[p];
        if (acted) continue;
        game._botTimers = game._botTimers || {};
        const key = `${p}:${game.phase}:${game.round}`;
        if (game._botTimers[key]) continue;
        const delay = game.phase === 'CAPTION' ? 2500 + Math.random() * 6000 : 1500 + Math.random() * 4000;
        game._botTimers[key] = setTimeout(() => {
          delete game._botTimers[key];
          const g = memeGames.get(lobbyId);
          if (!g || g !== game || g.status !== 'PLAYING') return;
          g.botAct(p);
          broadcastMemeState(lobbyId);
        }, delay);
      }
    }
  };

  const startMemeTimer = (lobbyId) => {
    clearMemeTimer(lobbyId);
    const tid = setInterval(() => {
      const g = memeGames.get(lobbyId);
      if (!g || g.status !== 'PLAYING') { clearMemeTimer(lobbyId); return; }
      g.tick();
      broadcastMemeState(lobbyId);
    }, 1000);
    memeTimers.set(lobbyId, tid);
  };

  socket.on("meme_start", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = memeGames.get(socket.lobbyId);
    if (g && g.players[0] === socket.steamId && g.start()) {
      startMemeTimer(socket.lobbyId);
      broadcastMemeState(socket.lobbyId);
    }
  });
  socket.on("meme_caption", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = memeGames.get(socket.lobbyId);
    if (g && g.submitCaption(socket.steamId, d)) broadcastMemeState(socket.lobbyId);
  });
  socket.on("meme_vote", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = memeGames.get(socket.lobbyId);
    if (!g) return;
    const ok = d && d.entryId != null
      ? g.voteByIndex(socket.steamId, d.entryId)
      : g.vote(socket.steamId, d && d.targetPlayerId);
    if (ok) broadcastMemeState(socket.lobbyId);
  });
  socket.on("meme_next_round", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = memeGames.get(socket.lobbyId);
    if (g && g.nextRound(socket.steamId)) broadcastMemeState(socket.lobbyId);
  });


  // ==========================================
  // SKRIBBL
  // ==========================================
  const broadcastSkribblState = (lobbyId) => {
    const game = skribblGames.get(lobbyId);
    if (!game) return;

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const sid = connectedUsers.get(p);
      if (sid) io.to(sid).emit("skribbl_state", game.getStateForPlayer(p));
    }

    if (game.status !== 'PLAYING') { clearSkribblTimer(lobbyId); return; }
    // The lobby starts the game for us, so the ticker is armed on first sight.
    if (!skribblTimers.has(lobbyId)) startSkribblTimer(lobbyId);

    // A bot drawer picks a word for itself.
    if (game.phase === 'CHOOSING') {
      const drawer = game.players[game.currentDrawerIndex];
      if (drawer && drawer.startsWith('BOT_') && !game._botChoosing) {
        game._botChoosing = true;
        setTimeout(() => {
          game._botChoosing = false;
          if (game.phase !== 'CHOOSING') return;
          game.chooseWord(drawer, Math.floor(Math.random() * game.wordChoices.length));
          broadcastSkribblState(lobbyId);
        }, 1500);
      }
    }

    // Bot guessers trickle in over the round rather than all at once.
    if (game.phase === 'DRAWING') {
      for (const p of game.players) {
        if (!p.startsWith('BOT_')) continue;
        if (p === game.players[game.currentDrawerIndex]) continue;
        if (game.guessedPlayers.has(p) || game._botGuessTimers?.[p]) continue;
        game._botGuessTimers = game._botGuessTimers || {};
        const word = game.currentWord;
        game._botGuessTimers[p] = setTimeout(() => {
          delete game._botGuessTimers[p];
          if (game.phase !== 'DRAWING' || game.currentWord !== word) return;
          game.guess(p, word);
          broadcastSkribblState(lobbyId);
        }, 8000 + Math.random() * 30000);
      }
    }
  };

  // One ticker per lobby drives the draw countdown *and* the pause between
  // turns, so rounds advance on their own instead of waiting on the host.
  const startSkribblTimer = (lobbyId) => {
    clearSkribblTimer(lobbyId);
    const tid = setInterval(() => {
      const g = skribblGames.get(lobbyId);
      if (!g || g.status !== 'PLAYING') { clearSkribblTimer(lobbyId); return; }
      g.tick();
      broadcastSkribblState(lobbyId);
    }, 1000);
    skribblTimers.set(lobbyId, tid);
  };

  socket.on("skribbl_start", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = skribblGames.get(socket.lobbyId);
    if (g && g.players[0] === socket.steamId && g.start()) {
      startSkribblTimer(socket.lobbyId);
      broadcastSkribblState(socket.lobbyId);
    }
  });

  socket.on("skribbl_choose_word", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = skribblGames.get(socket.lobbyId);
    if (g && g.chooseWord(socket.steamId, d?.wordIndex)) {
      if (!skribblTimers.has(socket.lobbyId)) startSkribblTimer(socket.lobbyId);
      broadcastSkribblState(socket.lobbyId);
    }
  });

  socket.on("skribbl_draw_data", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = skribblGames.get(socket.lobbyId);
    if (g && g.addDrawData(socket.steamId, d)) {
      socket.to(`lobby_${socket.lobbyId}`).emit("skribbl_draw", d);
    }
  });

  socket.on("skribbl_clear", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = skribblGames.get(socket.lobbyId);
    if (g && g.clearCanvas(socket.steamId)) {
      io.to(`lobby_${socket.lobbyId}`).emit("skribbl_draw", { type: 'clear' });
    }
  });

  socket.on("skribbl_undo", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = skribblGames.get(socket.lobbyId);
    if (g && g.undo(socket.steamId)) {
      io.to(`lobby_${socket.lobbyId}`).emit("skribbl_redraw", g.drawingData);
    }
  });

  socket.on("skribbl_guess", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = skribblGames.get(socket.lobbyId);
    if (!g) return;
    g.guess(socket.steamId, d?.text);
    broadcastSkribblState(socket.lobbyId);
  });

  socket.on("skribbl_next_turn", () => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = skribblGames.get(socket.lobbyId);
    if (g && g.nextTurn(socket.steamId)) broadcastSkribblState(socket.lobbyId);
  });

  // ==========================================
  // HEADSHOT (race mode)
  // ==========================================
  // Everyone races the same run of pros, but each seat only ever receives its
  // own board — rivals are reduced to a score and a guess count.
  const broadcastHeadshotState = (lobbyId) => {
    const game = headshotGames.get(lobbyId);
    if (!game) return;

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const sid = connectedUsers.get(p);
      if (sid) io.to(sid).emit("headshot_state", game.getStateForPlayer(p));
    }

    if (game.status !== 'PLAYING') { clearHeadshotTimer(lobbyId); return; }
    if (!headshotTimers.has(lobbyId)) startHeadshotTimer(lobbyId);
  };

  const startHeadshotTimer = (lobbyId) => {
    clearHeadshotTimer(lobbyId);
    const tid = setInterval(() => {
      const g = headshotGames.get(lobbyId);
      if (!g || g.status !== 'PLAYING') { clearHeadshotTimer(lobbyId); return; }
      if (g.tick()) broadcastHeadshotState(lobbyId);
    }, 1000);
    headshotTimers.set(lobbyId, tid);
  };

  socket.on("headshot_guess", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = headshotGames.get(socket.lobbyId);
    if (!g) return;
    if (g.guess(socket.steamId, d && d.player)) broadcastHeadshotState(socket.lobbyId);
    else socket.emit("headshot_reject", { player: d && d.player });
  });

  // ==========================================
  // PENTAKILL (race mode)
  // ==========================================
  const broadcastPentakillState = (lobbyId) => {
    const game = pentakillGames.get(lobbyId);
    if (!game) return;

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const sid = connectedUsers.get(p);
      if (sid) io.to(sid).emit("pentakill_state", game.getStateForPlayer(p));
    }

    if (game.status !== 'PLAYING') { clearPentakillTimer(lobbyId); return; }
    if (!pentakillTimers.has(lobbyId)) startPentakillTimer(lobbyId);
  };

  const startPentakillTimer = (lobbyId) => {
    clearPentakillTimer(lobbyId);
    const tid = setInterval(() => {
      const g = pentakillGames.get(lobbyId);
      if (!g || g.status !== 'PLAYING') { clearPentakillTimer(lobbyId); return; }
      if (g.tick()) broadcastPentakillState(lobbyId);
    }, 1000);
    pentakillTimers.set(lobbyId, tid);
  };

  // ==========================================
  // QUIZ RACE (BUILD PATH / BUY MENU)
  // ==========================================
  const broadcastQuizState = (lobbyId) => {
    const game = quizGames.get(lobbyId);
    if (!game) return;

    for (const p of game.players) {
      if (p.startsWith('BOT_')) continue;
      const sid = connectedUsers.get(p);
      if (sid) io.to(sid).emit("quiz_state", game.getStateForPlayer(p));
    }

    if (game.status !== 'PLAYING') { clearQuizTimer(lobbyId); return; }
    if (!quizTimers.has(lobbyId)) startQuizTimer(lobbyId);
  };

  const startQuizTimer = (lobbyId) => {
    clearQuizTimer(lobbyId);
    const tid = setInterval(() => {
      const g = quizGames.get(lobbyId);
      if (!g || g.status !== 'PLAYING') { clearQuizTimer(lobbyId); return; }
      if (g.tick()) broadcastQuizState(lobbyId);
    }, 1000);
    quizTimers.set(lobbyId, tid);
  };

  socket.on("quiz_answer", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = quizGames.get(socket.lobbyId);
    if (!g) return;
    if (g.answer(socket.steamId, d && d.questionId, d && d.choice)) broadcastQuizState(socket.lobbyId);
  });

  socket.on("pentakill_guess", (d) => {
    if (!socket.lobbyId || !socket.steamId) return;
    const g = pentakillGames.get(socket.lobbyId);
    if (!g) return;
    if (g.guess(socket.steamId, d && d.player)) broadcastPentakillState(socket.lobbyId);
    else socket.emit("pentakill_reject", { player: d && d.player });
  });

  // ==========================================
  // GARDEN PKMN SOCKET EVENTS
  // ==========================================
  
  socket.on("pkmn_join", async (data) => {
    if (!socket.steamId) return;
    const mapId = data?.mapId || "pallet_town";

    // Leave current map if any
    await handlePkmnLeave(socket, io);

    let trainer;
    try {
      trainer = await prisma.pkmnTrainer.findUnique({
        where: { SteamId: BigInt(socket.steamId) }
      });
      if (!trainer) {
        trainer = await prisma.pkmnTrainer.create({
          data: {
            SteamId: BigInt(socket.steamId),
            CurrentMap: mapId,
            PosX: 400,
            PosY: 300,
            Facing: "down",
            Inventory: "{}",
            Badges: "[]"
          }
        });
      }
    } catch(e) {
      console.error("PKMN DB Error:", e);
      return;
    }

    const actualMap = trainer.CurrentMap;
    const mapState = getPkmnMap(actualMap);
    
    const pData = {
      steamId: socket.steamId,
      x: trainer.PosX,
      y: trainer.PosY,
      facing: trainer.Facing
    };
    
    mapState.players[socket.steamId] = pData;
    socket.pkmnMap = actualMap;
    socket.join(`pkmn_map_${actualMap}`);
    
    socket.emit("pkmn_map_state", {
      mapId: actualMap,
      players: mapState.players
    });

    socket.to(`pkmn_map_${actualMap}`).emit("pkmn_player_joined", pData);

    // Fresh trainer (no mons yet): offer the starter choice
    try {
      const monCount = await prisma.PkmnMon.count({ where: { OwnerId: BigInt(socket.steamId) } });
      if (monCount === 0) socket.emit("pkmn_choose_starter");
    } catch (e) { /* non-fatal */ }
  });

  socket.on("pkmn_move", (data) => {
    if (!socket.steamId || !socket.pkmnMap) return;
    const mapState = getPkmnMap(socket.pkmnMap);
    const pData = mapState.players[socket.steamId];
    if (pData) {
      pData.x = data.x;
      pData.y = data.y;
      pData.facing = data.facing;
      
      socket.to(`pkmn_map_${socket.pkmnMap}`).emit("pkmn_player_moved", pData);
    }
  });

  socket.on("pkmn_leave", async () => {
    await handlePkmnLeave(socket, io);
  });

  socket.on("pkmn_chat", async (data) => {
    if (!socket.steamId || !socket.pkmnMap) return;
    
    if (data.message === '/heal') {
      await prisma.PkmnMon.updateMany({
        where: { OwnerId: BigInt(socket.steamId) },
        data: { Hp: 20 } // Max generic HP for now
      });
      socket.emit("pkmn_chat_message", {
        steamId: 'SERVER',
        message: 'Your party was fully healed!'
      });
      return;
    }

    socket.to(`pkmn_map_${socket.pkmnMap}`).emit("pkmn_chat_message", {
      steamId: socket.steamId,
      message: data.message
    });
  });

  const emitParty = async () => {
    const mons = await prisma.PkmnMon.findMany({
      where: { OwnerId: BigInt(socket.steamId), BoxId: null }
    });
    // BigInt isn't JSON-serialisable; also attach real max HP for the bars.
    socket.emit("pkmn_party_data", mons.map(m => ({
      ...m,
      OwnerId: m.OwnerId.toString(),
      MaxHp: maxHpForMon(m),
    })));
  };

  const emitBag = async () => {
    const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(socket.steamId) } });
    socket.emit("pkmn_bag_data", buildBagList(parseInv(trainer?.Inventory)));
  };

  socket.on("pkmn_get_party", async () => {
    if (!socket.steamId) return;
    await emitParty();
  });

  socket.on("pkmn_get_bag", async () => {
    if (!socket.steamId) return;
    await emitBag();
  });

  // Overworld item use — heal a party member with a potion.
  socket.on("pkmn_use_item", async (data) => {
    if (!socket.steamId) return;
    const item = ITEMS[data?.item];
    if (!item || item.kind !== 'heal') return;
    try {
      const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(socket.steamId) } });
      const inv = parseInv(trainer?.Inventory);
      if (!inv[data.item] || inv[data.item] <= 0) {
        socket.emit("pkmn_chat_message", { steamId: "SERVER", message: `No ${item.name} left.` });
        return;
      }
      const mon = await prisma.PkmnMon.findFirst({ where: { Id: data.monId, OwnerId: BigInt(socket.steamId) } });
      if (!mon) return;
      const maxHp = maxHpForMon(mon);
      if (mon.Hp >= maxHp) {
        socket.emit("pkmn_chat_message", { steamId: "SERVER", message: `${mon.Species} is already at full HP.` });
        return;
      }
      const newHp = Math.min(maxHp, mon.Hp + item.heal);
      inv[data.item] -= 1;
      if (inv[data.item] <= 0) delete inv[data.item];
      await prisma.PkmnMon.update({ where: { Id: mon.Id }, data: { Hp: newHp } });
      await prisma.pkmnTrainer.update({ where: { SteamId: BigInt(socket.steamId) }, data: { Inventory: JSON.stringify(inv) } });
      socket.emit("pkmn_chat_message", { steamId: "SERVER", message: `Restored ${newHp - mon.Hp} HP to ${mon.Nickname || mon.Species}.` });
      await emitParty();
      await emitBag();
    } catch (e) {
      console.error("PKMN use item error:", e);
    }
  });

  socket.on("pkmn_encounter", async () => {
    if (!socket.steamId) return;
    await pkmnBattleManager.startEncounter(socket, socket.steamId, prisma, socket.pkmnMap || "pallet_town");
  });

  // Starter choice: new trainers (no mons) pick Bulbasaur/Charmander/Squirtle
  socket.on("pkmn_pick_starter", async (data) => {
    if (!socket.steamId) return;
    try {
      const mon = await pkmnBattleManager.createStarter(prisma, socket.steamId, data?.species);
      if (mon) {
        socket.emit("pkmn_starter_confirmed", { species: mon.Species });
        socket.emit("pkmn_chat_message", { steamId: "SERVER", message: `You chose ${mon.Species}! Take good care of it.` });
      }
    } catch (e) {
      console.error("PKMN starter error:", e);
    }
  });

  socket.on("pkmn_interact", async (data) => {
    if (!socket.steamId) return;
    if (data.npcId === 'npc_joey') {
      await pkmnBattleManager.startTrainerBattle(socket, socket.steamId, prisma, {
        name: 'Youngster Joey',
        team: [{ species: 'Rattata', level: 5, moves: ['tackle', 'tailwhip'], ability: 'runaway', nature: 'hardy', evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 }, ivs: { hp:15,atk:15,def:15,spa:15,spd:15,spe:15 } }]
      });
    }
  });

  socket.on("pkmn_battle_action", async (data) => {
    if (!socket.steamId) return;
    await pkmnBattleManager.handleBattleAction(socket, socket.steamId, data, prisma);
  });
});

// ---------------------------------------------------------------------------
// Discord bot bridge: a tiny HTTP surface on the same server the sockets use,
// so the bot (scripts/discordBot.js) can spin up a lobby and hand back a link.
// Guarded by a shared secret; only /discord/* is handled here, everything else
// falls through to Socket.IO.
// ---------------------------------------------------------------------------
const DISCORD_BOT_SECRET = process.env.DISCORD_BOT_SECRET || "";
const GAMES_PUBLIC_URL = (process.env.GAMES_PUBLIC_URL || "https://games.retakes.fr").replace(/\/$/, "");
const BASE_GAMES = ["monopoly", "uno", "skribbl", "meme", "codenames", "cah", "headshot", "pentakill", "buildpath", "buymenu"];

const syncPublicLobbies = () => {
  io.emit("public_lobbies_sync", Array.from(universalLobbies.values())
    .filter(l => !l.isPrivate)
    .map(l => l.getPublicState()));
};

let nextReady = false;

httpServer.on("request", (req, res) => {
  // Socket.IO intercepts requests to /socket.io/ and handles them.
  // We must not write headers or respond to those.
  if (req.url && req.url.startsWith("/socket.io/")) return;

  // Everything that isn't the Discord bridge is a website request: hand it to
  // Next. This used to `return` bare, which was correct when Next ran as a
  // separate process — once Next was folded into this server it meant every
  // page request was accepted and then never answered, so the site just hung.
  if (!req.url || !req.url.startsWith("/discord/")) {
    if (nextReady) return nextHandler(req, res);
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not Found (Standalone WebSocket Server)");
  }
  const json = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (req.method === "GET" && req.url === "/discord/health") return json(200, { ok: true });

  if (req.method === "POST" && req.url === "/discord/create-lobby") {
    if (!DISCORD_BOT_SECRET || req.headers["x-bot-secret"] !== DISCORD_BOT_SECRET) {
      return json(401, { error: "unauthorized" });
    }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 4000) req.destroy(); });
    req.on("end", () => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch { return json(400, { error: "bad_json" }); }

      const lobbyId = Math.random().toString(36).substr(2, 9);
      const name = (typeof data.name === "string" && data.name.trim().slice(0, 40)) || "Discord lobby";
      // host "PENDING" — claimed by the first human who opens the link (see lobby_join)
      const lobby = new UniversalLobby(lobbyId, "PENDING", name, false, null);
      if (BASE_GAMES.includes(data.game)) {
        lobby.currentGame = `${data.game}_${data.lang === "fr" ? "fr" : "en"}`;
      }
      lobby.discordCreated = true;
      universalLobbies.set(lobbyId, lobby);

      // Keep it alive up to 10 min waiting for its first player, then cull.
      const t = setTimeout(() => {
        lobbyCleanupTimers.delete(lobbyId);
        const l = universalLobbies.get(lobbyId);
        if (l && l.players.length === 0) { universalLobbies.delete(lobbyId); syncPublicLobbies(); }
      }, 10 * 60 * 1000);
      lobbyCleanupTimers.set(lobbyId, t);

      syncPublicLobbies();
      json(200, { id: lobbyId, url: `${GAMES_PUBLIC_URL}/lobby/${lobbyId}`, game: lobby.currentGame });
    });
    return;
  }

  // Fallback to Next.js handler
  if (nextReady) return nextHandler(req, res);
  res.writeHead(404, { "Content-Type": "text/plain" });
  return res.end("Not Found");
});

nextApp.prepare().then(() => {
  nextReady = true;
  const PORT = process.env.PORT || 3000;

  // Start the background meta scraper (once every hour)
  scrapeAll().catch(console.error);
  setInterval(() => scrapeAll().catch(console.error), 3600000);

  httpServer.listen(PORT, () => {
    console.log(`> Websockets & Next.js ready on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.warn("Next.js prepare failed (likely no build found). Starting WebSocket server in standalone mode...");
  const PORT = process.env.PORT || 3000;

  // Start the background meta scraper (once every hour)
  scrapeAll().catch(console.error);
  setInterval(() => scrapeAll().catch(console.error), 3600000);

  httpServer.listen(PORT, () => {
    console.log(`> Websockets ready on port ${PORT}`);
  });
});
