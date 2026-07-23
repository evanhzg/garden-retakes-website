"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { useGameIdentity, usePlayerNames, displayNameFor, PlayerNameMap } from "@/components/games/hooks";

// Import game components
import UnoGameWrapper from "@/components/games/UnoGame";
import MonopolyGameWrapper from "@/components/games/MonopolyGame";
import CahGameWrapper from "@/components/games/CahGame";
import CodenamesGameWrapper from "@/components/games/CodenamesGame";
import MemeGameWrapper from "@/components/games/MemeGame";
import SkribblGameWrapper from "@/components/games/SkribblGame";
import { listBoards } from "@/components/games/editor/boardStore";

import "./lobby.css";

const GAMES = [
  { id: "monopoly", name: "MONOPOLY", icon: "💰", min: 2, max: 4 },
  { id: "uno", name: "UNO", icon: "🃏", min: 2, max: 4 },
  { id: "codenames", name: "CODENAMES", icon: "🕵️", min: 4, max: 8 },
  { id: "cah", name: "CARDS AGAINST", icon: "⬛", min: 3, max: 8 },
  { id: "meme", name: "MAKE IT MEME", icon: "😂", min: 3, max: 8 },
  { id: "skribbl", name: "SKRIBBL", icon: "✏️", min: 3, max: 8 },
];

type ChatMsg = { from: string; content: string; type: string; subject?: string | null; ts?: number };

export default function UniversalLobbyWrapper() {
  const params = useParams();
  const id = params.id as string;
  const steamId = useGameIdentity();

  if (!steamId) {
    return (
      <div className="lobby-container flex-center">
        <div className="loader" />
      </div>
    );
  }

  return (
    <SocketProvider steamId={steamId}>
      <LobbyClient lobbyId={id} mySteamId={steamId} />
    </SocketProvider>
  );
}

function LobbyClient({ lobbyId, mySteamId }: { lobbyId: string; mySteamId: string }) {
  const { socket, isConnected, isAuthed } = useSocket();
  const router = useRouter();

  const [lobbyState, setLobbyState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [boards, setBoards] = useState<any[]>([]);
  const [savedBoards, setSavedBoards] = useState<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef("");

  useEffect(() => {
    // Lock body scroll while in the lobby
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  useEffect(() => {
    if (!socket || !isConnected || !isAuthed) return;

    socket.on("lobby_state", (state) => {
      setLobbyState(state);
      setError(null);
    });

    socket.on("lobby_error", (err) => setError(err.message));

    socket.on("lobby_toast", (data) => {
      setToast(data.message);
      setTimeout(() => setToast(null), 3000);
    });

    socket.on("lobby_kicked", () => {
      router.push("/games?kicked=1");
    });

    socket.on("chat_history", (history: ChatMsg[]) => {
      setChatMessages(history.filter(m => m.type === "lobby"));
    });

    socket.on("new_message", (msg: ChatMsg) => {
      if (msg.type === "lobby") {
        setChatMessages(prev => [...prev.slice(-99), msg]);
      }
    });

    // Monopoly board choices for the board picker.
    socket.on("boards_list", (list: any[]) => setBoards(list));
    socket.emit("get_boards");

    // Server acked authentication (isAuthed), so this join is race-free
    socket.emit("lobby_join", { lobbyId, password: passwordRef.current });

    return () => {
      socket.emit("lobby_leave");
      socket.off("lobby_state");
      socket.off("lobby_error");
      socket.off("lobby_toast");
      socket.off("lobby_kicked");
      socket.off("chat_history");
      socket.off("new_message");
      socket.off("boards_list");
    };
  }, [socket, isConnected, isAuthed, lobbyId, router]);

  // Custom boards from the editor (localStorage) for the board picker.
  useEffect(() => { setSavedBoards(listBoards()); }, []);

  // Autoscroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chatMessages]);

  // Resolve display names for players + chat authors + system message subjects
  const idsToResolve = useMemo(() => {
    const ids = new Set<string>();
    lobbyState?.players?.forEach((p: any) => ids.add(p.steamId));
    if (lobbyState?.host) ids.add(lobbyState.host);
    chatMessages.forEach(m => {
      if (m.from !== "SYSTEM") ids.add(m.from);
      if (m.subject) ids.add(m.subject);
    });
    return Array.from(ids);
  }, [lobbyState, chatMessages]);
  const names = usePlayerNames(idsToResolve);

  const handleJoinWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    passwordRef.current = passwordInput;
    setError(null);
    socket?.emit("lobby_join", { lobbyId, password: passwordInput });
  };

  const handleReady = () => socket?.emit("lobby_ready");
  const handleStartGame = () => socket?.emit("lobby_start_game");
  const handleChangeGame = (game: string) => socket?.emit("lobby_change_game", { game });
  const handleSelectBoard = (boardId: string) => socket?.emit("lobby_select_board", { boardId });
  const handleSelectCustomBoard = (def: any) => socket?.emit("lobby_select_board", { boardDef: def });
  const handleAddBot = () => socket?.emit("lobby_add_bot");
  const handleKick = (steamId: string) => socket?.emit("lobby_kick", steamId);
  const handleSetTeamMode = (mode: string) => socket?.emit("lobby_set_team_mode", { mode });
  const handleSetTeam = (steamId: string, team: number) => socket?.emit("lobby_set_team", { steamId, team });

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socket?.emit("send_message", { type: "lobby", content: chatInput.trim() });
      setChatInput("");
    }
  };

  const renderChatMessage = (msg: ChatMsg, i: number) => {
    if (msg.from === "SYSTEM") {
      const text = msg.subject
        ? msg.content.replace("{player}", displayNameFor(msg.subject, names))
        : msg.content;
      return (
        <div key={i} className="chat-message system">{text}</div>
      );
    }
    return (
      <div key={i} className={`chat-message ${msg.from === mySteamId ? "own" : ""}`}>
        <span className="chat-author">{displayNameFor(msg.from, names)}</span>
        <span className="chat-content">{msg.content}</span>
      </div>
    );
  };

  if (error === "Invalid password") {
    return (
      <div className="lobby-container flex-center">
        <form className="lobby-modal glass-panel" onSubmit={handleJoinWithPassword}>
          <div className="lobby-modal-icon">🔒</div>
          <h2>Private Lobby</h2>
          <p>Enter the password to join.</p>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="lobby-input"
            autoFocus
          />
          <button type="submit" className="btn-primary">Join</button>
          <button type="button" onClick={() => router.push("/games")} className="btn-ghost">Back to Games</button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lobby-container flex-center">
        <div className="lobby-modal glass-panel">
          <div className="lobby-modal-icon">😵</div>
          <h2>Oops</h2>
          <p>{error}</p>
          <button onClick={() => router.push("/games")} className="btn-primary">Return to Games</button>
        </div>
      </div>
    );
  }

  if (!lobbyState) {
    return (
      <div className="lobby-container flex-center">
        <div className="loader"></div>
        {!isConnected && <p className="lobby-connecting">Connecting…</p>}
      </div>
    );
  }

  const isHost = lobbyState.host === mySteamId;
  const myPlayer = lobbyState.players.find((p: any) => p.steamId === mySteamId);
  const playerCount = lobbyState.players.length;
  const maxPlayers = lobbyState.maxPlayers ?? 8;

  const [baseGame, gameLang] = (lobbyState.currentGame || "none").split("_");
  const currentGameConfig = GAMES.find(g => g.id === baseGame);
  const lang = gameLang === "fr" ? "fr" : "en";

  const playerCountValid = !currentGameConfig || (playerCount >= currentGameConfig.min && playerCount <= currentGameConfig.max);
  const others = lobbyState.players.filter((p: any) => !p.isBot && p.steamId !== lobbyState.host);
  const readyCount = others.filter((p: any) => p.ready).length;
  const everyoneReady = others.every((p: any) => p.ready);
  const canStart = isHost && everyoneReady && playerCountValid && lobbyState.currentGame !== "none";

  // If game is playing, render the specific game component!
  if (lobbyState.status === "PLAYING") {
    switch (baseGame) {
      case "uno": return <UnoGameWrapper />;
      case "monopoly": return <MonopolyGameWrapper />;
      case "cah": return <CahGameWrapper />;
      case "codenames": return <CodenamesGameWrapper />;
      case "meme": return <MemeGameWrapper />;
      case "skribbl": return <SkribblGameWrapper />;
      default: return <div>Unknown game type: {baseGame}</div>;
    }
  }

  const setGame = (id: string) => handleChangeGame(`${id}_${lang}`);
  const setLang = (l: string) => {
    if (baseGame && baseGame !== "none") handleChangeGame(`${baseGame}_${l}`);
  };

  return (
    <div className="lobby-container">
      {toast && <div className="lobby-toast glass-panel">{toast}</div>}
      {!isConnected && <div className="lobby-reconnect-banner">Reconnecting…</div>}

      <div className="lobby-content">
        <div className="lobby-left-panel glass-panel">
          <header className="lobby-header">
            <div className="lobby-header-row">
              <h1>{lobbyState.name}</h1>
              <button className="btn-invite" onClick={handleCopyInvite} title="Copy invite link">
                {copied ? "✓ Copied!" : "🔗 Invite"}
              </button>
            </div>
            <div className="lobby-badges">
              <span className="lbadge">{lobbyState.isPrivate ? "🔒 Private" : "🌍 Public"}</span>
              <span className="lbadge">👥 {playerCount}/{maxPlayers}</span>
              {currentGameConfig && (
                <span className="lbadge lbadge-game">{currentGameConfig.icon} {currentGameConfig.name} · {lang.toUpperCase()}</span>
              )}
            </div>
          </header>

          {currentGameConfig && !playerCountValid && (
            <div className="lobby-warning">
              <span className="warning-icon">⚠️</span>
              <span>
                {playerCount < currentGameConfig.min
                  ? `${currentGameConfig.name} needs at least ${currentGameConfig.min} players (currently ${playerCount})`
                  : `${currentGameConfig.name} supports at most ${currentGameConfig.max} players (currently ${playerCount})`
                }
              </span>
            </div>
          )}

          {/* Game Selection */}
          <div className="lobby-game-picker">
            <div className="picker-header">
              <h3>Game</h3>
              {isHost ? (
                <div className="lang-toggle small">
                  <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
                  <button className={lang === "fr" ? "active" : ""} onClick={() => setLang("fr")}>FR</button>
                </div>
              ) : (
                <span className="picker-hint">Only the host picks the game</span>
              )}
            </div>
            <div className="game-picker-grid">
              {GAMES.map((game) => {
                const isSelected = baseGame === game.id;
                const tooMany = playerCount > game.max;
                const tooFew = playerCount < game.min;
                const incompatible = tooMany || tooFew;

                return (
                  <button
                    key={game.id}
                    className={`game-pick-card ${isSelected ? "selected" : ""} ${incompatible ? "incompatible" : ""}`}
                    onClick={() => isHost && setGame(game.id)}
                    disabled={!isHost}
                    title={incompatible ? (tooMany ? `Max ${game.max} players` : `Needs ${game.min}+ players`) : game.name}
                  >
                    <span className="game-pick-icon">{game.icon}</span>
                    <span className="game-pick-name">{game.name}</span>
                    <span className="game-pick-players">{game.min}–{game.max}P</span>
                    {incompatible && (
                      <span className="game-pick-limit-badge">
                        {tooMany ? `≤${game.max}` : `≥${game.min}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monopoly board picker */}
          {baseGame === "monopoly" && boards.length > 0 && (
            <div className="lobby-board-picker">
              <div className="picker-header">
                <h3>Board</h3>
                <a className="picker-hint editor-link" href="/board-editor">✎ Create / edit boards</a>
              </div>
              {!isHost && <span className="picker-hint">Only the host picks the board</span>}
              <div className="board-picker-grid">
                {boards.map((b) => {
                  const isSel = (lobbyState.selectedBoardId || "classic") === b.id;
                  const swatches = Object.values(b.groupColors || {}).slice(0, 8) as string[];
                  return (
                    <button
                      key={b.id}
                      className={`board-pick-card ${isSel ? "selected" : ""}`}
                      onClick={() => isHost && handleSelectBoard(b.id)}
                      disabled={!isHost}
                      style={{ ["--accent" as any]: b.accent }}
                      title={b.name}
                    >
                      <span className="board-pick-swatches">
                        {swatches.map((c, i) => <span key={i} style={{ background: c }} />)}
                      </span>
                      <span className="board-pick-name">{b.name}</span>
                      <span className="board-pick-meta">{b.tileCount} tiles</span>
                    </button>
                  );
                })}
                {savedBoards.map((b) => {
                  const isSel = lobbyState.selectedBoardId === b.id;
                  const swatches = Object.values(b.theme?.groupColors || {}).slice(0, 8) as string[];
                  return (
                    <button
                      key={b.id}
                      className={`board-pick-card ${isSel ? "selected" : ""}`}
                      onClick={() => isHost && handleSelectCustomBoard(b)}
                      disabled={!isHost}
                      style={{ ["--accent" as any]: b.theme?.accent || "#38bdf8" }}
                      title={b.name}
                    >
                      <span className="board-pick-swatches">
                        {swatches.map((c, i) => <span key={i} style={{ background: c as string }} />)}
                      </span>
                      <span className="board-pick-name">{b.name} <span className="board-pick-custom">custom</span></span>
                      <span className="board-pick-meta">{b.tiles?.length ?? 0} tiles</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monopoly team mode (2v2 allies) */}
          {baseGame === "monopoly" && (
            <div className="lobby-team-picker">
              <div className="picker-header"><h3>Mode</h3></div>
              <div className="team-mode-toggle">
                <button
                  className={(lobbyState.teamMode || "ffa") === "ffa" ? "on" : ""}
                  onClick={() => isHost && handleSetTeamMode("ffa")}
                  disabled={!isHost}
                >Free-for-all</button>
                <button
                  className={lobbyState.teamMode === "2v2" ? "on" : ""}
                  onClick={() => isHost && handleSetTeamMode("2v2")}
                  disabled={!isHost}
                >2v2 Allies</button>
              </div>
              {lobbyState.teamMode === "2v2" && (
                <span className="picker-hint">2v2 needs exactly 4 players, 2 per team · teammates pay no rent to each other</span>
              )}
            </div>
          )}

          {/* Players */}
          <div className="lobby-players-section">
            <div className="players-header">
              <h3>Players <span className="players-count">{playerCount}/{maxPlayers}</span></h3>
              {isHost && playerCount < maxPlayers && (
                <button onClick={handleAddBot} className="btn-add-bot">🤖 Add Bot</button>
              )}
            </div>
            <div className="players-grid">
              {lobbyState.players.map((p: any) => (
                <PlayerCard
                  key={p.steamId}
                  player={p}
                  names={names}
                  isHostPlayer={p.steamId === lobbyState.host}
                  isMe={p.steamId === mySteamId}
                  canKick={isHost && p.steamId !== mySteamId}
                  onKick={() => handleKick(p.steamId)}
                  teamMode={lobbyState.teamMode || "ffa"}
                  canSetTeam={isHost}
                  onSetTeam={(team: number) => handleSetTeam(p.steamId, team)}
                />
              ))}
              {Array.from({ length: Math.max(0, maxPlayers - playerCount) }).map((_, index) => (
                <div key={`empty-${index}`} className="player-card empty-slot">
                  <div className="player-avatar">+</div>
                  <div className="player-info">
                    <span className="player-name">Open slot</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lobby-right-panel">
          <div className="lobby-chat glass-panel">
            <h3 className="chat-title">Lobby Chat</h3>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="chat-message system">Say hi 👋</div>
              )}
              {chatMessages.map(renderChatMessage)}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChatMessage} className="chat-input-area">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message…"
                maxLength={300}
              />
              <button type="submit" disabled={!chatInput.trim()}>➤</button>
            </form>
          </div>

          <div className="lobby-actions-panel glass-panel">
            {isHost ? (
              <>
                <div className="ready-summary">
                  {others.length === 0
                    ? "You can add bots or invite friends"
                    : `${readyCount}/${others.length} players ready`}
                </div>
                <button
                  onClick={handleStartGame}
                  className={`btn-start ${!playerCountValid ? "invalid-count" : ""}`}
                  disabled={!canStart}
                  title={
                    lobbyState.currentGame === "none" ? "Select a game first"
                      : !playerCountValid && currentGameConfig ? `Need ${currentGameConfig.min}–${currentGameConfig.max} players`
                      : !everyoneReady ? "Waiting for players to ready up"
                      : ""
                  }
                >
                  {lobbyState.currentGame === "none" ? "SELECT A GAME"
                    : !playerCountValid && currentGameConfig
                      ? (playerCount < currentGameConfig.min
                        ? `NEED ${currentGameConfig.min - playerCount} MORE PLAYER${currentGameConfig.min - playerCount !== 1 ? "S" : ""}`
                        : `${playerCount - currentGameConfig.max} PLAYER${playerCount - currentGameConfig.max !== 1 ? "S" : ""} TOO MANY`)
                      : !everyoneReady ? "WAITING FOR READY…"
                      : "START GAME"}
                </button>
              </>
            ) : (
              <button
                onClick={handleReady}
                className={`btn-ready ${myPlayer?.ready ? "is-ready" : ""}`}
              >
                {myPlayer?.ready ? "✓ READY — TAP TO CANCEL" : "READY UP"}
              </button>
            )}

            <button onClick={() => router.push("/games")} className="btn-leave">
              LEAVE LOBBY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, names, isHostPlayer, isMe, canKick, onKick, teamMode = "ffa", canSetTeam = false, onSetTeam }: {
  player: any;
  names: PlayerNameMap;
  isHostPlayer: boolean;
  isMe: boolean;
  canKick: boolean;
  onKick: () => void;
  teamMode?: string;
  canSetTeam?: boolean;
  onSetTeam?: (team: number) => void;
}) {
  const name = displayNameFor(player.steamId, names, player);
  const avatar = names[player.steamId]?.avatar || null;
  const disconnected = player.connected === false;
  const team = player.team;
  const teamLetter = team === 0 ? "A" : team === 1 ? "B" : null;

  return (
    <div className={`player-card ${player.ready ? "ready" : ""} ${disconnected ? "disconnected" : ""} ${isMe ? "me" : ""} ${teamMode === "2v2" && team != null ? `team-t${team}` : ""}`}>
      <div className="player-avatar">
        {player.isBot ? "🤖" : avatar ? <img src={avatar} alt="" /> : name.charAt(0).toUpperCase()}
        {isHostPlayer && <span className="host-crown">👑</span>}
      </div>
      <div className="player-info">
        <span className="player-name">{name}{isMe ? " (you)" : ""}</span>
        <span className={`player-status ${player.ready || isHostPlayer ? "status-ready" : ""}`}>
          {disconnected ? "RECONNECTING…" : isHostPlayer ? "HOST" : player.isBot ? "BOT" : player.ready ? "READY" : "NOT READY"}
        </span>
      </div>
      {teamMode === "2v2" && (
        canSetTeam ? (
          <div className="team-switch">
            <button className={`team-btn t0 ${team === 0 ? "on" : ""}`} onClick={() => onSetTeam?.(0)} title="Team A">A</button>
            <button className={`team-btn t1 ${team === 1 ? "on" : ""}`} onClick={() => onSetTeam?.(1)} title="Team B">B</button>
          </div>
        ) : (
          teamLetter && <span className={`team-badge t${team}`}>{teamLetter}</span>
        )
      )}
      {canKick && (
        <button onClick={onKick} className="btn-kick" title={`Kick ${name}`}>✕</button>
      )}
    </div>
  );
}
