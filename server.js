const { createServer } = require("http");
const { Server } = require("socket.io");
const UnoGame = require("./scripts/unoLogic");
const MonopolyGame = require("./scripts/monopolyLogic");
const CodenamesGame = require("./scripts/codenamesLogic");
const CahGame = require("./scripts/cahLogic");
const MemeGame = require("./scripts/memeLogic");
const pkmnBattleManager = require("./scripts/pkmnBattleManager");
const SkribblGame = require("./scripts/skribblLogic");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

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
      "http://localhost:3000",
      "http://localhost:3131",
    ];

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"]
  }
});

// SteamID -> Socket ID mapping for presence
const connectedUsers = new Map();

const UniversalLobby = require('./scripts/universalLobby');
const universalLobbies = new Map(); // lobbyId -> UniversalLobby
const lobbyCleanupTimers = new Map(); // lobbyId -> timeout handle for grace period deletion
const playerDisconnectTimers = new Map(); // `${lobbyId}:${steamId}` -> timeout for player-level grace

// Active game instances (lobbyId -> GameInstance)

// Active UNO Games: lobbyId -> UnoGame instance
const unoGames = new Map();

// Active Monopoly Games: lobbyId -> MonopolyGame instance
const monopolyGames = new Map();
const codenamesGames = new Map();
const cahGames = new Map();
const cahTimers = new Map();
const memeGames = new Map();
const skribblGames = new Map();

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

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // When a user authenticates with the websocket
  socket.on("authenticate", (data) => {
    const { steamId } = data;
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
        unoGames.delete(lobbyId);
        monopolyGames.delete(lobbyId);
        codenamesGames.delete(lobbyId);
        cahGames.delete(lobbyId);
        memeGames.delete(lobbyId);
        skribblGames.delete(lobbyId);
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
    
    broadcastLobbyState(lobbyId);
  });

  socket.on("get_public_lobbies", () => {
    socket.emit("public_lobbies_sync", Array.from(universalLobbies.values())
      .filter(l => !l.isPrivate)
      .map(l => l.getPublicState())
    );
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

    socket.join(`lobby_${lobbyId}`);
    socket.lobbyId = lobbyId;

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
          gameInstance = new UnoGame(lobbyId);
          if (data?.modifiers) gameInstance.modifiers = data.modifiers;
          unoGames.set(lobbyId, gameInstance);
          break;
        case 'monopoly':
          gameInstance = new MonopolyGame(lobbyId);
          monopolyGames.set(lobbyId, gameInstance);
          break;
        case 'codenames':
          gameInstance = new CodenamesGame(lobbyId);
          codenamesGames.set(lobbyId, gameInstance);
          break;
        case 'cah':
          gameInstance = new CahGame(lobbyId);
          gameInstance.language = lang;
          if (data?.settings) {
            gameInstance.turnTimer = data.settings.turnTimer || 0;
          }
          cahGames.set(lobbyId, gameInstance);
          break;
        case 'meme':
          gameInstance = new MemeGame(lobbyId);
          memeGames.set(lobbyId, gameInstance);
          break;
        case 'skribbl':
          gameInstance = new SkribblGame(lobbyId);
          skribblGames.set(lobbyId, gameInstance);
          break;
      }

      if (gameInstance) {
        // Add all lobby players to the game instance
        lobby.players.forEach(p => {
          gameInstance.addPlayer(p.steamId);
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
        unoGames.delete(lobbyId);
        monopolyGames.delete(lobbyId);
        codenamesGames.delete(lobbyId);
        cahGames.delete(lobbyId);
        memeGames.delete(lobbyId);
        skribblGames.delete(lobbyId);
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
  // UNO SPECIFIC LOGIC
  // ==========================================
  
  const handleUnoBotTurn = (game, lobbyId) => {
    setTimeout(() => {
      if (game.status !== 'PLAYING') return;
      const currentBotId = game.players[game.currentTurnIndex];
      if (!currentBotId || !currentBotId.startsWith('BOT_')) return;

      // 1. Try to catch someone who forgot to call UNO (30% chance)
      for (const p of game.players) {
        if (p !== currentBotId && game.hands[p].length === 1 && !game.calledUno[p]) {
          if (Math.random() > 0.7) {
            game.catchUno(currentBotId, p);
            broadcastUnoState(lobbyId);
            return; // Acted by catching, broadcast will trigger next bot step if still turn
          }
        }
      }

      const hand = game.hands[currentBotId];
      const topCard = game.discardPile[game.discardPile.length - 1];
      
      // If we already drew a card this turn (Play-on-Draw)
      if (game.hasDrawnThisTurn) {
        const drawnCard = hand[hand.length - 1];
        const isValid = drawnCard.color === 'wild' || drawnCard.color === game.currentColor || drawnCard.value === topCard.value;
        if (isValid) {
          let declaredColor = null;
          if (drawnCard.color === 'wild') {
            const colors = ['red', 'blue', 'green', 'yellow'];
            declaredColor = colors[Math.floor(Math.random() * colors.length)];
          }
          if (hand.length === 2) game.callUno(currentBotId);
          game.playCard(currentBotId, drawnCard.id, declaredColor);
        } else {
          game.passTurn(currentBotId);
        }
        broadcastUnoState(lobbyId);
        return;
      }

      let cardToPlay = null;
      let declaredColor = null;

      // Special handling if stacking is active and a +2/+4 was just played
      const needsToStack = game.drawPenalty > 0;
      
      for (const card of hand) {
        if (needsToStack) {
          if (card.value === topCard.value) {
            cardToPlay = card;
            break;
          }
        } else {
          if (card.color === 'wild' || card.color === game.currentColor || card.value === topCard.value) {
            cardToPlay = card;
            if (card.color === 'wild') {
              const colors = ['red', 'blue', 'green', 'yellow'];
              declaredColor = colors[Math.floor(Math.random() * colors.length)];
            }
            break;
          }
        }
      }

      if (cardToPlay) {
        // If 7-0 rule is active and 7 is played, pick a random target
        let targetId = null;
        if (cardToPlay.value === '7' && game.modifiers?.sevenZero) {
          const others = game.players.filter(p => p !== currentBotId);
          targetId = others[Math.floor(Math.random() * others.length)];
        }
        
        // Call UNO if playing second to last card
        if (hand.length === 2) {
          game.callUno(currentBotId);
        }

        game.playCard(currentBotId, cardToPlay.id, declaredColor, targetId);
      } else {
        game.drawCard(currentBotId);
      }
      
      broadcastUnoState(lobbyId);
    }, 1500);
  };

  const broadcastUnoState = (lobbyId) => {
    const game = unoGames.get(lobbyId);
    if (!game) return;
    
    // Send personalized state to each player in the game
    for (const p of game.players) {
      if (!p.startsWith('BOT_')) {
        const pSocketId = connectedUsers.get(p);
        if (pSocketId) {
          io.to(pSocketId).emit("uno_state", game.getStateForPlayer(p));
        }
      }
    }

    if (game.status === 'PLAYING' && game.players[game.currentTurnIndex]?.startsWith('BOT_')) {
      handleUnoBotTurn(game, lobbyId);
    }
  };

  socket.on("uno_play", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const game = unoGames.get(socket.lobbyId);
      if (game) {
        const success = game.playCard(socket.steamId, data.cardId, data.declaredColor, data.targetId);
        if (success) broadcastUnoState(socket.lobbyId);
      }
    }
  });

  socket.on("uno_draw", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = unoGames.get(socket.lobbyId);
      if (game) {
        const drawn = game.drawCard(socket.steamId);
        if (drawn) broadcastUnoState(socket.lobbyId);
      }
    }
  });

  socket.on("uno_pass_turn", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = unoGames.get(socket.lobbyId);
      if (game) {
        const success = game.passTurn(socket.steamId);
        if (success) broadcastUnoState(socket.lobbyId);
      }
    }
  });

  socket.on("uno_call_uno", () => {
    if (socket.lobbyId && socket.steamId) {
      const game = unoGames.get(socket.lobbyId);
      if (game) {
        const success = game.callUno(socket.steamId);
        if (success) broadcastUnoState(socket.lobbyId);
      }
    }
  });

  socket.on("uno_catch_uno", (data) => {
    if (socket.lobbyId && socket.steamId) {
      const game = unoGames.get(socket.lobbyId);
      if (game) {
        game.catchUno(socket.steamId, data.targetId);
        broadcastUnoState(socket.lobbyId);
      }
    }
  });

  // ==========================================
  // MONOPOLY SPECIFIC LOGIC
  // ==========================================

  const handleMonopolyBotTurn = (game, lobbyId) => {
    setTimeout(() => {
      if (game.status !== 'PLAYING') return;
      const currentBotId = game.players[game.currentTurnIndex];
      if (!currentBotId || !currentBotId.startsWith('BOT_')) return;

      if (game.turnPhase === 'ROLL') {
        if (game.playerStates[currentBotId].jailed && game.playerStates[currentBotId].money > 500) {
           game.payJail(currentBotId);
        }
        game.rollDice(currentBotId);
      } else if (game.turnPhase === 'ACTION') {
        const state = game.playerStates[currentBotId];
        const space = game.board[state.position];
        if (space && (space.type === 'property' || space.type === 'rail' || space.type === 'util') && space.owner === null && state.money >= space.price) {
          game.buyProperty(currentBotId);
        } else {
          if (state.money > 500) {
            const owned = game.board.filter(s => s.owner === currentBotId && s.type === 'property');
            for (const s of owned) {
               if (game.buildHouse(currentBotId, s.id)) break; 
            }
          }
          game.endTurn(currentBotId);
        }
      } else if (game.turnPhase === 'END') {
        game.endTurn(currentBotId);
      }

      broadcastMonopolyState(lobbyId);
    }, 1500);
  };

  const broadcastMonopolyState = (lobbyId) => {
    const game = monopolyGames.get(lobbyId);
    if (!game) return;
    io.to(`lobby_${lobbyId}`).emit("monopoly_state", game.getState());

    if (game.status === 'PLAYING' && game.players[game.currentTurnIndex]?.startsWith('BOT_')) {
      handleMonopolyBotTurn(game, lobbyId);
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

  // ==========================================
  // CODENAMES
  // ==========================================
  const broadcastCodenamesState = (lobbyId) => {
    const game = codenamesGames.get(lobbyId);
    if (!game) return;
    for (const p of game.players) {
      if (!p.startsWith('BOT_')) {
        const sid = connectedUsers.get(p);
        if (sid) io.to(sid).emit("codenames_state", game.getStateForPlayer(p));
      }
    }
    // Bot spymaster clue
    if (game.status === 'PLAYING' && game.phase === 'CLUE') {
      const sm = game.spymasters[game.currentTeam];
      if (sm?.startsWith('BOT_')) {
        setTimeout(() => {
          const words = ['AGENT', 'TARGET', 'HINT', 'CLUE', 'LEAD'];
          game.giveClue(sm, words[Math.floor(Math.random() * words.length)], 1);
          broadcastCodenamesState(lobbyId);
        }, 2000);
      }
    }
    // Bot operative guess
    if (game.status === 'PLAYING' && game.phase === 'GUESS') {
      const team = game.currentTeam;
      const operatives = game.teams[team].filter(p => p !== game.spymasters[team]);
      const botOp = operatives.find(p => p.startsWith('BOT_'));
      if (botOp) {
        setTimeout(() => {
          const unrevealed = game.board.map((c, i) => ({ ...c, idx: i })).filter((_, i) => !game.revealed[i]);
          if (unrevealed.length > 0) {
            const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
            game.guess(botOp, pick.idx);
            broadcastCodenamesState(lobbyId);
          }
        }, 2500);
      }
    }
  };
  socket.on("codenames_start", () => { if(socket.lobbyId){const g=codenamesGames.get(socket.lobbyId); if(g&&g.start())broadcastCodenamesState(socket.lobbyId);} });
  socket.on("codenames_clue", (d) => { if(socket.lobbyId&&socket.steamId){const g=codenamesGames.get(socket.lobbyId); if(g&&g.giveClue(socket.steamId,d.word,d.count))broadcastCodenamesState(socket.lobbyId);} });
  socket.on("codenames_guess", (d) => { if(socket.lobbyId&&socket.steamId){const g=codenamesGames.get(socket.lobbyId); if(g&&g.guess(socket.steamId,d.cardIndex))broadcastCodenamesState(socket.lobbyId);} });
  socket.on("codenames_end_guessing", () => { if(socket.lobbyId&&socket.steamId){const g=codenamesGames.get(socket.lobbyId); if(g&&g.endGuessing(socket.steamId))broadcastCodenamesState(socket.lobbyId);} });

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
      if (!p.startsWith('BOT_')) {
        const sid = connectedUsers.get(p);
        if (sid) io.to(sid).emit("cah_state", game.getStateForPlayer(p));
      }
    }
    // Bot submit
    if (game.status === 'PLAYING' && game.phase === 'SUBMIT') {
      const czar = game.players[game.czarIndex];
      for (const p of game.players) {
        if (p.startsWith('BOT_') && p !== czar && !game.submissions[p]) {
          setTimeout(() => {
            const hand = game.hands[p];
            if (hand && hand.length > 0) {
              const pick = game.currentBlack?.pick || 1;
              const ids = hand.slice(0, pick).map(c => c.id);
              game.submitCards(p, ids);
              broadcastCahState(lobbyId);
            }
          }, 1500 + Math.random() * 2000);
        }
      }
    }
    // Bot czar pick
    if (game.status === 'PLAYING' && game.phase === 'JUDGE') {
      const czar = game.players[game.czarIndex];
      if (czar.startsWith('BOT_')) {
        setTimeout(() => {
          if (game.revealedSubmissions.length > 0) {
            const pick = game.revealedSubmissions[Math.floor(Math.random() * game.revealedSubmissions.length)];
            game.pickWinner(czar, pick.playerId);
            broadcastCahState(lobbyId);
            // Auto next round
            setTimeout(() => { game.nextRound(game.players[0]); broadcastCahState(lobbyId); }, 3000);
          }
        }, 2000);
      }
    }
  };
  socket.on("cah_settings", (d) => { if(socket.lobbyId){const g=cahGames.get(socket.lobbyId); if(g&&g.players[0]===socket.steamId){g.language = d.language; g.turnTimer = d.turnTimer; broadcastCahState(socket.lobbyId);}} });
  const startCahTimer = (lobbyId, g) => {
    if (cahTimers.has(lobbyId)) clearInterval(cahTimers.get(lobbyId));
    if (g.turnTimer !== 'Infinite') {
      const tid = setInterval(() => {
        const advanced = g.tick();
        broadcastCahState(lobbyId);
        if (advanced) {
          // If auto-advanced, check if game is over or next phase needs timer
          if (g.status === 'FINISHED' || g.phase === 'REVEAL') clearInterval(tid);
        }
      }, 1000);
      cahTimers.set(lobbyId, tid);
    }
  };

  socket.on("cah_start", () => { 
    if(socket.lobbyId){
      const g=cahGames.get(socket.lobbyId); 
      if(g&&g.players[0]===socket.steamId&&g.start()){
        broadcastCahState(socket.lobbyId);
        startCahTimer(socket.lobbyId, g);
      }
    } 
  });
  
  socket.on("cah_submit", (d) => { 
    if(socket.lobbyId&&socket.steamId){
      const g=cahGames.get(socket.lobbyId); 
      if(g&&g.submitCards(socket.steamId,d.cardIds)){
        broadcastCahState(socket.lobbyId);
        if(g.phase === 'JUDGE') startCahTimer(socket.lobbyId, g);
      }
    } 
  });

  socket.on("cah_submit_custom", async (d) => {
    if(socket.lobbyId&&socket.steamId){
      const g=cahGames.get(socket.lobbyId);
      if(g && g.status === 'PLAYING' && g.phase === 'SUBMIT') {
        const formattedCards = await Promise.all(d.customTexts.map(t => formatCustomCard(t, g.language)));
        if (g.submitCustomCards(socket.steamId, formattedCards)) {
          broadcastCahState(socket.lobbyId);
          if(g.phase === 'JUDGE') startCahTimer(socket.lobbyId, g);
        }
      }
    }
  });

  socket.on("cah_pick_winner", (d) => { 
    if(socket.lobbyId&&socket.steamId){
      const g=cahGames.get(socket.lobbyId); 
      if(g&&g.pickWinner(socket.steamId,d.winnerPlayerId)){
        if (cahTimers.has(socket.lobbyId)) clearInterval(cahTimers.get(socket.lobbyId));
        broadcastCahState(socket.lobbyId);
      }
    } 
  });
  
  socket.on("cah_next_round", () => { 
    if(socket.lobbyId&&socket.steamId){
      const g=cahGames.get(socket.lobbyId); 
      if(g&&g.nextRound(socket.steamId)){
        broadcastCahState(socket.lobbyId);
        startCahTimer(socket.lobbyId, g);
      }
    } 
  });
  
  // ==========================================
  // MAKE IT MEME
  // ==========================================
  const broadcastMemeState = (lobbyId) => {
    const game = memeGames.get(lobbyId);
    if (!game) return;
    for (const p of game.players) {
      if (!p.startsWith('BOT_')) {
        const sid = connectedUsers.get(p);
        if (sid) io.to(sid).emit("meme_state", game.getStateForPlayer(p));
      }
    }
    // Bot caption
    if (game.status === 'PLAYING' && game.phase === 'CAPTION') {
      for (const p of game.players) {
        if (p.startsWith('BOT_') && !game.submissions[p]) {
          setTimeout(() => {
            const pool = MemeGame.getBotCaptions();
            const slots = game.currentTemplate?.slots || 1;
            const caps = [];
            for (let i = 0; i < slots; i++) caps.push(pool[Math.floor(Math.random() * pool.length)]);
            game.submitCaption(p, caps);
            broadcastMemeState(lobbyId);
          }, 2000 + Math.random() * 3000);
        }
      }
    }
    // Bot vote
    if (game.status === 'PLAYING' && game.phase === 'VOTE') {
      for (const p of game.players) {
        if (p.startsWith('BOT_') && !game.votes[p]) {
          setTimeout(() => {
            const others = game.roundResults.filter(r => r.playerId !== p);
            if (others.length > 0) { game.vote(p, others[Math.floor(Math.random() * others.length)].playerId); broadcastMemeState(lobbyId); }
          }, 1500 + Math.random() * 2000);
        }
      }
    }
    // Auto next round from bot host
    if (game.status === 'PLAYING' && game.phase === 'RESULTS' && game.players[0]?.startsWith('BOT_')) {
      setTimeout(() => { game.nextRound(game.players[0]); broadcastMemeState(lobbyId); }, 4000);
    }
  };
  socket.on("meme_start", () => { if(socket.lobbyId){const g=memeGames.get(socket.lobbyId); if(g&&g.players[0]===socket.steamId&&g.start())broadcastMemeState(socket.lobbyId);} });
  socket.on("meme_caption", (d) => { if(socket.lobbyId&&socket.steamId){const g=memeGames.get(socket.lobbyId); if(g&&g.submitCaption(socket.steamId,d.captions))broadcastMemeState(socket.lobbyId);} });
  socket.on("meme_vote", (d) => { if(socket.lobbyId&&socket.steamId){const g=memeGames.get(socket.lobbyId); if(g&&g.vote(socket.steamId,d.targetPlayerId))broadcastMemeState(socket.lobbyId);} });
  socket.on("meme_next_round", () => { if(socket.lobbyId&&socket.steamId){const g=memeGames.get(socket.lobbyId); if(g&&g.nextRound(socket.steamId))broadcastMemeState(socket.lobbyId);} });


  // ==========================================
  // SKRIBBL
  // ==========================================
  const broadcastSkribblState = (lobbyId) => {
    const game = skribblGames.get(lobbyId);
    if (!game) return;
    for (const p of game.players) {
      if (!p.startsWith('BOT_')) {
        const sid = connectedUsers.get(p);
        if (sid) io.to(sid).emit("skribbl_state", game.getStateForPlayer(p));
      }
    }
    // Bot choose word
    if (game.status === 'PLAYING' && game.phase === 'CHOOSING') {
      const drawer = game.players[game.currentDrawerIndex];
      if (drawer?.startsWith('BOT_')) {
        setTimeout(() => { game.chooseWord(drawer, Math.floor(Math.random() * 3)); broadcastSkribblState(lobbyId); }, 1500);
      }
    }
    // Bot guessers
    if (game.status === 'PLAYING' && game.phase === 'DRAWING') {
      for (const p of game.players) {
        if (p.startsWith('BOT_') && p !== game.players[game.currentDrawerIndex] && !game.guessedPlayers.has(p)) {
          setTimeout(() => {
            if (game.currentWord) {
              game.guess(p, game.currentWord);
              broadcastSkribblState(lobbyId);
            }
          }, 5000 + Math.random() * 15000);
        }
      }
    }
  };
  // Skribbl timer
  const skribblTimers = new Map();
  socket.on("skribbl_start", () => { if(socket.lobbyId){const g=skribblGames.get(socket.lobbyId); if(g&&g.players[0]===socket.steamId&&g.start()){broadcastSkribblState(socket.lobbyId);}} });
  socket.on("skribbl_choose_word", (d) => { if(socket.lobbyId&&socket.steamId){const g=skribblGames.get(socket.lobbyId); if(g&&g.chooseWord(socket.steamId,d.wordIndex)){broadcastSkribblState(socket.lobbyId); const tid=setInterval(()=>{if(g.tick()){clearInterval(tid);}broadcastSkribblState(socket.lobbyId);},1000); skribblTimers.set(socket.lobbyId,tid);}} });
  socket.on("skribbl_draw_data", (d) => { if(socket.lobbyId){const g=skribblGames.get(socket.lobbyId); if(g&&g.addDrawData(socket.steamId,d)){io.to(`lobby_${socket.lobbyId}`).emit("skribbl_draw",d);}} });
  socket.on("skribbl_clear", () => { if(socket.lobbyId&&socket.steamId){const g=skribblGames.get(socket.lobbyId); if(g&&g.clearCanvas(socket.steamId)){io.to(`lobby_${socket.lobbyId}`).emit("skribbl_draw",{type:'clear'});}} });
  socket.on("skribbl_guess", (d) => { if(socket.lobbyId&&socket.steamId){const g=skribblGames.get(socket.lobbyId); if(g){const r=g.guess(socket.steamId,d.text);broadcastSkribblState(socket.lobbyId);}} });
  socket.on("skribbl_next_turn", () => { if(socket.lobbyId&&socket.steamId){const g=skribblGames.get(socket.lobbyId); if(g&&g.nextTurn(socket.steamId)){const tid=skribblTimers.get(socket.lobbyId);if(tid)clearInterval(tid);broadcastSkribblState(socket.lobbyId);}} });

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

  socket.on("pkmn_get_party", async () => {
    if (!socket.steamId) return;
    const mons = await prisma.PkmnMon.findMany({
      where: { OwnerId: BigInt(socket.steamId), BoxId: null }
    });
    // Serialize BigInt correctly or convert to string. OwnerId is BigInt
    const safeMons = mons.map(m => ({
      ...m,
      OwnerId: m.OwnerId.toString()
    }));
    socket.emit("pkmn_party_data", safeMons);
  });

  socket.on("pkmn_encounter", async () => {
    if (!socket.steamId) return;
    await pkmnBattleManager.startEncounter(socket, socket.steamId, prisma);
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

const PORT = process.env.PORT || process.env.WS_PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
