"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { useGameIdentity, usePlayerNames, displayNameFor, PlayerNameMap } from "@/components/games/hooks";

// Import game components
import UnoGameWrapper from "@/components/games/UnoGame";
import MonopolyGameWrapper from "@/components/games/MonopolyGame";
import CahGameWrapper from "@/components/games/CahGame";
import CodenamesGameWrapper from "@/components/games/CodenamesGame";
import MemeGameWrapper from "@/components/games/MemeGame";
import SkribblGameWrapper from "@/components/games/SkribblGame";
import UnoRulesPanel from "@/components/games/UnoRulesPanel";
import MemeOptionsPanel from "@/components/games/MemeOptionsPanel";
import CahOptionsPanel from "@/components/games/CahOptionsPanel";
import GameIcon from "@/components/games/GameIcon";
import { listBoards } from "@/components/games/editor/boardStore";

import "./lobby.css";

// `ready: false` games are visible but not selectable — they still need work.
const GAMES = [
  { id: "monopoly", name: "MONOPO7Y", icon: "💰", min: 2, max: 4, ready: true, tagline: "Property warfare" },
  { id: "uno", name: "OUNO", icon: "🃏", min: 2, max: 4, ready: true, tagline: "Cards & chaos" },
  { id: "skribbl", name: "SKRIBBL", icon: "✏️", min: 2, max: 8, ready: true, tagline: "Draw & guess" },
  { id: "meme", name: "HASAMEME", icon: "😂", min: 3, max: 8, ready: true, tagline: "Caption battle" },
  { id: "codenames", name: "CODENAMES", icon: "🕵️", min: 4, max: 8, ready: false, tagline: "Spy words" },
  { id: "cah", name: "PILE OF...", icon: "⬛", min: 3, max: 8, ready: true, tagline: "Fill in the blank" },
];

// Per-game banner gradients for the lobby hero.
const GAME_THEME: Record<string, string> = {
  none: "linear-gradient(135deg, #1e293b, #0f172a 60%, #312e81)",
  monopoly: "linear-gradient(135deg, #0d4b2f, #1a1a2e 55%, #d4a843)",
  uno: "linear-gradient(135deg, #b91c1c, #1a1a2e 52%, #f59e0b)",
  skribbl: "linear-gradient(135deg, #0ea5e9, #1a1a2e 52%, #22c55e)",
  meme: "linear-gradient(135deg, #db2777, #1a1a2e 52%, #7c3aed)",
  codenames: "linear-gradient(135deg, #1e3a5f, #0f172a 52%, #dc2626)",
  cah: "linear-gradient(135deg, #111, #000 55%, #333)",
};

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
  const [privInput, setPrivInput] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [boards, setBoards] = useState<any[]>([]);
  const [savedBoards, setSavedBoards] = useState<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef("");

  useEffect(() => {
    // Lock body scroll while in the lobby
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!socket || !isConnected || !isAuthed) return;

    socket.on("lobby_state", (state) => {
      setLobbyState(state);
      setError(null);
    });

    socket.on("lobby_error", (err) => {
      // A lobby that no longer exists (or never did) → back to the hub.
      if (err.message === "Lobby not found") { router.push("/games"); return; }
      setError(err.message);
    });

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
  const handleSetUnoRules = (payload: { rules?: any; extras?: any }) => socket?.emit("lobby_set_uno_rules", payload);
  const handleSetSkribblRounds = (rounds: number) => socket?.emit("lobby_set_skribbl_rounds", { rounds });
  const handleSetMemeOptions = (payload: { options?: any; customTemplates?: any }) => socket?.emit("lobby_set_meme_options", payload);
  const handleSetCahOptions = (payload: { options?: any }) => socket?.emit("lobby_set_cah_options", payload);
  const setPrivacy = (isPrivate: boolean, password = privInput) => socket?.emit("lobby_set_privacy", { isPrivate, password });

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
  const gameReady = !currentGameConfig || currentGameConfig.ready;
  const canStart = isHost && everyoneReady && playerCountValid && gameReady && lobbyState.currentGame !== "none";

  // Hidden data element for the Chrome Extension to read
  const rpcData = (
    <div 
      id="discord-rpc-data" 
      data-players={`${playerCount}/${maxPlayers}`}
      data-status={lobbyState.status}
      data-game={baseGame}
      data-lobby={lobbyState.name}
      style={{ display: "none" }} 
    />
  );

  // If game is playing, render the specific game component!
  if (lobbyState.status === "PLAYING") {
    if (baseGame === "uno") return <>{rpcData}<UnoGameWrapper lobbyId={lobbyId} mySteamId={mySteamId} lang={lang} /></>;
    if (baseGame === "monopoly") return <>{rpcData}<MonopolyGameWrapper lobbyId={lobbyId} mySteamId={mySteamId} lang={lang} /></>;
    if (baseGame === "cah") return <>{rpcData}<CahGameWrapper lobbyId={lobbyId} mySteamId={mySteamId} lang={lang} /></>;
    if (baseGame === "codenames") return <>{rpcData}<CodenamesGameWrapper lobbyId={lobbyId} mySteamId={mySteamId} /></>;
    if (baseGame === "meme") return <>{rpcData}<MemeGameWrapper lobbyId={lobbyId} mySteamId={mySteamId} lang={lang} /></>;
    if (baseGame === "skribbl") return <>{rpcData}<SkribblGameWrapper lobbyId={lobbyId} mySteamId={mySteamId} lang={lang} /></>;
    return <div className="lobby-container flex-center">{rpcData}Game started, but component not found.</div>;
  }

  const setGame = (id: string) => handleChangeGame(`${id}_${lang}`);
  const setLang = (l: string) => {
    if (baseGame && baseGame !== "none") handleChangeGame(`${baseGame}_${l}`);
  };

  const startLabel =
    lobbyState.currentGame === "none" ? "SELECT A GAME"
      : !gameReady ? "COMING SOON"
      : !playerCountValid && currentGameConfig
        ? (playerCount < currentGameConfig.min
          ? `NEED ${currentGameConfig.min - playerCount} MORE PLAYER${currentGameConfig.min - playerCount !== 1 ? "S" : ""}`
          : `${playerCount - currentGameConfig.max} PLAYER${playerCount - currentGameConfig.max !== 1 ? "S" : ""} TOO MANY`)
        : !everyoneReady ? "WAITING FOR READY…"
        : "START GAME";

  const hasOptions = baseGame === "uno" || baseGame === "skribbl" || baseGame === "meme"
    || baseGame === "cah" || (baseGame === "monopoly");

  return (
    <div className="lobby-shell">
      {rpcData}
      <div className="lobby-bg" style={{ background: GAME_THEME[baseGame] || GAME_THEME.none }} aria-hidden />

      <AnimatePresence>
        {toast && (
          <motion.div className="lobby-toast glass-panel" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      {!isConnected && <div className="lobby-reconnect-banner">Reconnecting…</div>}

      {/* ---------------------------------------------------------- hero */}
      <header className="lobby-hero">
        <div className="lobby-hero-left">
          <motion.div
            key={baseGame}
            className="lobby-hero-badge"
            initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            {currentGameConfig ? <GameIcon id={currentGameConfig.id} size={38} /> : "🎮"}
          </motion.div>
          <div className="lobby-hero-text">
            <div className="lobby-hero-game">
              {currentGameConfig ? currentGameConfig.name : "PICK A GAME"}
              {currentGameConfig && <span className="lobby-hero-tag">{currentGameConfig.tagline}</span>}
            </div>
            <h1 className="lobby-hero-name">{lobbyState.name}</h1>
            <div className="lobby-badges">
              <span className="lbadge">{lobbyState.isPrivate ? "🔒 Private" : "🌍 Public"}</span>
              <span className="lbadge">👥 {playerCount}/{maxPlayers}</span>
              {currentGameConfig && <span className="lbadge lbadge-game">{lang.toUpperCase()}</span>}
            </div>
          </div>
        </div>
        <div className="lobby-hero-actions">
          {isHost && (
            <div className="lobby-privacy">
              <button
                className={`lobby-priv-toggle ${lobbyState.isPrivate ? "on" : ""}`}
                onClick={() => { if (lobbyState.isPrivate) { setPrivacy(false); setShowPrivacy(false); } else { setShowPrivacy(true); setPrivacy(true, privInput); } }}
                title={lobbyState.isPrivate ? "Make public" : "Make private"}
              >
                {lobbyState.isPrivate ? "🔒 Private" : "🌍 Public"}
              </button>
              {lobbyState.isPrivate && (showPrivacy || !lobbyState.name) && (
                <input
                  className="lobby-priv-pass"
                  type="text"
                  value={privInput}
                  onChange={(e) => setPrivInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setPrivacy(true, privInput); setShowPrivacy(false); } }}
                  onBlur={() => setPrivacy(true, privInput)}
                  placeholder="Password (optional)"
                  maxLength={64}
                />
              )}
            </div>
          )}
          <button className="btn-invite" onClick={handleCopyInvite} title="Copy invite link">
            {copied ? "✓ Copied!" : "🔗 Invite"}
          </button>
          <button className="btn-hero-leave" onClick={() => router.push("/games")} title="Leave lobby">✕</button>
        </div>
      </header>

      {/* ---------------------------------------------------------- body */}
      <div className="lobby-body">
        {/* main: setup + roster */}
        <div className="lobby-main">
          {/* game picker */}
          <section className="lobby-section glass-panel">
            <div className="picker-header">
              <h3>🎮 Choose your game</h3>
              {isHost ? (
                <div className="lang-toggle small">
                  <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>🇬🇧 EN</button>
                  <button className={lang === "fr" ? "active" : ""} onClick={() => setLang("fr")}>🇫🇷 FR</button>
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
                  <motion.button
                    key={game.id}
                    whileHover={isHost && game.ready ? { y: -3 } : undefined}
                    whileTap={isHost && game.ready ? { scale: 0.97 } : undefined}
                    className={`game-pick-card ${isSelected ? "selected" : ""} ${incompatible ? "incompatible" : ""} ${game.ready ? "" : "not-ready"}`}
                    onClick={() => isHost && game.ready && setGame(game.id)}
                    disabled={!isHost || !game.ready}
                    style={{ ["--game-theme" as any]: GAME_THEME[game.id] }}
                    title={
                      !game.ready ? `${game.name} — coming soon`
                        : incompatible ? (tooMany ? `Max ${game.max} players` : `Needs ${game.min}+ players`)
                        : game.name
                    }
                  >
                    <span className="game-pick-icon"><GameIcon id={game.id} size={26} /></span>
                    <span className="game-pick-name">{game.name}</span>
                    <span className="game-pick-players">{game.min}–{game.max}P</span>
                    {!game.ready && <span className="game-pick-soon-badge">SOON</span>}
                    {game.ready && incompatible && (
                      <span className="game-pick-limit-badge">{tooMany ? `≤${game.max}` : `≥${game.min}`}</span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {currentGameConfig && !playerCountValid && (
              <div className="lobby-warning">
                <span className="warning-icon">⚠️</span>
                <span>
                  {playerCount < currentGameConfig.min
                    ? `${currentGameConfig.name} needs at least ${currentGameConfig.min} players (currently ${playerCount})`
                    : `${currentGameConfig.name} supports at most ${currentGameConfig.max} players (currently ${playerCount})`}
                </span>
              </div>
            )}
          </section>

          {/* per-game setup */}
          {baseGame !== "none" && hasOptions && (
            <section className="lobby-section glass-panel">
              {baseGame === "uno" && (
                <UnoRulesPanel rules={lobbyState.unoRules || {}} extras={lobbyState.unoExtras || {}} isHost={isHost} lang={lang} onChange={handleSetUnoRules} />
              )}

              {baseGame === "meme" && (
                <MemeOptionsPanel
                  options={lobbyState.memeOptions || {}}
                  customTemplates={lobbyState.memeCustomTemplates || []}
                  isHost={isHost}
                  lang={lang}
                  onChange={handleSetMemeOptions}
                />
              )}

              {baseGame === "cah" && (
                <CahOptionsPanel
                  options={lobbyState.cahOptions || {}}
                  isHost={isHost}
                  lang={lang}
                  onChange={handleSetCahOptions}
                />
              )}

              {baseGame === "skribbl" && (
                <div className="lobby-team-picker">
                  <div className="picker-header">
                    <h3>Rounds</h3>
                    {!isHost && <span className="picker-hint">Only the host picks the length</span>}
                  </div>
                  <div className="team-mode-toggle">
                    {[2, 3, 5].map((r) => (
                      <button key={r} className={(lobbyState.skribblRounds ?? 3) === r ? "on" : ""} onClick={() => isHost && handleSetSkribblRounds(r)} disabled={!isHost}>
                        {r} rounds
                      </button>
                    ))}
                  </div>
                  <span className="picker-hint">Each player draws once per round · words are in {lang === "fr" ? "French" : "English"}</span>
                </div>
              )}

              {baseGame === "monopoly" && (
                <>
                  {boards.length > 0 && (
                    <div className="lobby-board-picker">
                      <div className="picker-header">
                        <h3>Board</h3>
                        <a className="picker-hint editor-link" href="/board-editor">✎ Create / edit boards</a>
                        <a className="picker-hint editor-link" href="/sandbox">🧪 Test buildings</a>
                      </div>
                      {!isHost && <span className="picker-hint">Only the host picks the board</span>}
                      <div className="board-picker-grid">
                        {boards.map((b) => {
                          const isSel = (lobbyState.selectedBoardId || "classic") === b.id;
                          const swatches = Object.values(b.groupColors || {}).slice(0, 8) as string[];
                          return (
                            <button key={b.id} className={`board-pick-card ${isSel ? "selected" : ""}`} onClick={() => isHost && handleSelectBoard(b.id)} disabled={!isHost} style={{ ["--accent" as any]: b.accent }} title={b.name}>
                              <span className="board-pick-swatches">{swatches.map((c, i) => <span key={i} style={{ background: c }} />)}</span>
                              <span className="board-pick-name">{b.name}</span>
                              <span className="board-pick-meta">{b.tileCount} tiles</span>
                            </button>
                          );
                        })}
                        {savedBoards.map((b) => {
                          const isSel = lobbyState.selectedBoardId === b.id;
                          const swatches = Object.values(b.theme?.groupColors || {}).slice(0, 8) as string[];
                          return (
                            <button key={b.id} className={`board-pick-card ${isSel ? "selected" : ""}`} onClick={() => isHost && handleSelectCustomBoard(b)} disabled={!isHost} style={{ ["--accent" as any]: b.theme?.accent || "#38bdf8" }} title={b.name}>
                              <span className="board-pick-swatches">{swatches.map((c, i) => <span key={i} style={{ background: c as string }} />)}</span>
                              <span className="board-pick-name">{b.name} <span className="board-pick-custom">custom</span></span>
                              <span className="board-pick-meta">{b.tiles?.length ?? 0} tiles</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="lobby-team-picker">
                    <div className="picker-header"><h3>Mode</h3></div>
                    <div className="team-mode-toggle">
                      <button className={(lobbyState.teamMode || "ffa") === "ffa" ? "on" : ""} onClick={() => isHost && handleSetTeamMode("ffa")} disabled={!isHost}>Free-for-all</button>
                      <button className={lobbyState.teamMode === "2v2" ? "on" : ""} onClick={() => isHost && handleSetTeamMode("2v2")} disabled={!isHost}>2v2 Allies</button>
                    </div>
                    {lobbyState.teamMode === "2v2" && (
                      <span className="picker-hint">2v2 needs exactly 4 players, 2 per team · teammates pay no rent to each other</span>
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          {/* roster */}
          <section className="lobby-section glass-panel">
            <div className="players-header">
              <h3>🪑 Players <span className="players-count">{playerCount}/{maxPlayers}</span></h3>
              <div className="ready-track">
                <div className="ready-track-bar"><span style={{ width: `${others.length ? (readyCount / others.length) * 100 : 100}%` }} /></div>
                <span className="ready-track-label">{others.length === 0 ? "no guests yet" : `${readyCount}/${others.length} ready`}</span>
              </div>
            </div>
            <div className="roster-grid">
              <AnimatePresence mode="popLayout">
                {lobbyState.players.map((p: any) => (
                  <motion.div
                    key={p.steamId}
                    layout
                    initial={{ opacity: 0, scale: 0.7, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  >
                    <PlayerSeat
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
                  </motion.div>
                ))}
              </AnimatePresence>

              {playerCount < maxPlayers && isHost && (
                <button className="seat seat-add" onClick={handleAddBot} title="Add a bot">
                  <span className="seat-add-plus">🤖</span>
                  <span className="seat-add-label">Add bot</span>
                </button>
              )}
              {Array.from({ length: Math.max(0, maxPlayers - playerCount - (isHost ? 1 : 0)) }).map((_, index) => (
                <div key={`empty-${index}`} className="seat seat-empty">
                  <span className="seat-empty-dot" />
                  <span className="seat-empty-label">Open slot</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* side: chat + actions */}
        <aside className="lobby-side">
          <div className="lobby-chat glass-panel">
            <h3 className="chat-title">💬 Lobby Chat</h3>
            <div className="chat-messages">
              {chatMessages.length === 0 && <div className="chat-message system">Say hi 👋</div>}
              {chatMessages.map(renderChatMessage)}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChatMessage} className="chat-input-area">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message…" maxLength={300} />
              <button type="submit" disabled={!chatInput.trim()}>➤</button>
            </form>
          </div>

          <div className="lobby-actions-panel glass-panel">
            {isHost ? (
              <>
                <div className="ready-summary">
                  {others.length === 0 ? "Add bots or invite friends to begin" : `${readyCount}/${others.length} players ready`}
                </div>
                <motion.button
                  onClick={handleStartGame}
                  className={`btn-start ${!playerCountValid ? "invalid-count" : ""} ${canStart ? "hot" : ""}`}
                  disabled={!canStart}
                  animate={canStart ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                  transition={canStart ? { repeat: Infinity, duration: 1.8 } : {}}
                >
                  {canStart && <span className="btn-start-glow" aria-hidden />}
                  {startLabel}
                </motion.button>
              </>
            ) : (
              <motion.button
                onClick={handleReady}
                className={`btn-ready ${myPlayer?.ready ? "is-ready" : ""}`}
                whileTap={{ scale: 0.97 }}
              >
                {myPlayer?.ready ? "✓ READY — TAP TO CANCEL" : "READY UP"}
              </motion.button>
            )}

            <button onClick={() => router.push("/games")} className="btn-leave">LEAVE LOBBY</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PlayerSeat({ player, names, isHostPlayer, isMe, canKick, onKick, teamMode = "ffa", canSetTeam = false, onSetTeam }: {
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
  const ready = player.ready || isHostPlayer;
  const status = disconnected ? "RECONNECTING…" : isHostPlayer ? "HOST" : player.isBot ? "BOT" : player.ready ? "READY" : "NOT READY";

  return (
    <div className={`seat ${ready ? "ready" : ""} ${disconnected ? "disconnected" : ""} ${isMe ? "me" : ""} ${teamMode === "2v2" && team != null ? `team-t${team}` : ""}`}>
      {canKick && <button onClick={onKick} className="seat-kick" title={`Kick ${name}`}>✕</button>}
      <div className="seat-avatar">
        {player.isBot ? "🤖" : avatar ? <img src={avatar} alt="" /> : name.charAt(0).toUpperCase()}
        {isHostPlayer && <span className="seat-crown">👑</span>}
        {player.ready && !isHostPlayer && <span className="seat-ready-badge">✓</span>}
      </div>
      <span className="seat-name">{name}{isMe ? " (you)" : ""}</span>
      <span className={`seat-status ${ready ? "on" : ""}`}>{status}</span>

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
    </div>
  );
}
