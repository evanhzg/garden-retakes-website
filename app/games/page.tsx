"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { useGameIdentity, usePlayerNames, displayNameFor } from "@/components/games/hooks";
import "./games.css";

const GAMES = [
  { id: "monopoly", name: "MONOPOLY", icon: "💰", description: "Business Tour-style fast property trading with 3D dice physics, auctions, and ruthless bot AI.", players: "2–4" },
  { id: "uno", name: "UNO", icon: "🃏", description: "Competitive card battles with stacking, jump-ins, 7-0 swaps, and Play-on-Draw modifiers.", players: "2–4" },
  { id: "codenames", name: "CODENAMES", icon: "🕵️", description: "Two teams, one spymaster each. Give one-word clues, guess your agents — but avoid the assassin.", players: "4–8" },
  { id: "cah", name: "CARDS AGAINST", icon: "⬛", description: "A party game for terrible people. Fill in the blanks, the Card Czar picks the winner.", players: "3–8" },
  { id: "meme", name: "MAKE IT MEME", icon: "😂", description: "Same template, different captions. Write your funniest take, then vote for the best one.", players: "3–8" },
  { id: "skribbl", name: "SKRIBBL", icon: "✏️", description: "One draws, everyone guesses. Real-time canvas, fuzzy matching, and timed rounds.", players: "3–8" },
];

const GAME_LABELS: Record<string, string> = Object.fromEntries(GAMES.map(g => [g.id, g.name]));

function prettyGame(currentGame: string): string {
  if (!currentGame || currentGame === "none") return "Hanging out";
  const [base, lang] = currentGame.split("_");
  const label = GAME_LABELS[base] || base.toUpperCase();
  return lang ? `${label} · ${lang.toUpperCase()}` : label;
}

export default function GamesHubWrapper() {
  const steamId = useGameIdentity();

  if (!steamId) {
    return (
      <div className="games-hub-layout">
        <div className="hub-loading"><div className="loader" /></div>
      </div>
    );
  }

  return (
    <SocketProvider steamId={steamId}>
      <GamesHub />
    </SocketProvider>
  );
}

function GamesHub() {
  const router = useRouter();
  const { socket, isAuthed, steamId } = useSocket();
  const [publicLobbies, setPublicLobbies] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const [lobbyName, setLobbyName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [selectedGame, setSelectedGame] = useState("none");
  const [language, setLanguage] = useState<"en" | "fr">("en");

  const hostIds = publicLobbies.map(l => l.host);
  const names = usePlayerNames(hostIds);

  useEffect(() => {
    if (!socket) return;
    socket.on("public_lobbies_sync", (lobbies) => setPublicLobbies(lobbies));
    return () => {
      socket.off("public_lobbies_sync");
    };
  }, [socket]);

  // Ask for the current list as soon as we're authenticated — without this the
  // sidebar stays empty until some lobby happens to change.
  useEffect(() => {
    if (socket && isAuthed) {
      socket.emit("get_public_lobbies");
    }
  }, [socket, isAuthed]);

  const handleCreateLobby = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !isAuthed || creating) return;
    setCreating(true);

    socket.emit("lobby_create", {
      name: lobbyName || `Player ${(steamId || "").slice(-4)}'s Lobby`,
      isPrivate,
      password,
      currentGame: selectedGame === "none" ? "none" : `${selectedGame}_${language}`,
    });

    socket.once("lobby_state", (state) => {
      router.push(`/games/lobby/${state.id}`);
    });
  };

  const preselectGame = (gameId: string) => {
    setSelectedGame(gameId);
    setShowCreateModal(true);
  };

  const handleJoinCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().split("/").pop();
    if (code) router.push(`/games/lobby/${code}`);
  };

  return (
    <div className="games-hub-layout">
      <div className="games-main">
        <header className="hub-header hub-header-row">
          <div>
            <h1>GAMES HUB</h1>
            <p>Create a universal lobby to play with friends.</p>
          </div>
          <button className="btn-primary" onClick={() => { setSelectedGame("none"); setShowCreateModal(true); }}>
            + Create Lobby
          </button>
        </header>

        <div className="games-grid">
          {GAMES.map((game) => (
            <div
              key={game.id}
              className="game-card"
              data-game={game.id}
              onClick={() => preselectGame(game.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") preselectGame(game.id); }}
            >
              <div className="game-card-bg" />
              <div className="game-card-content">
                <div className="game-card-top">
                  <span className="game-card-icon">{game.icon}</span>
                  <h2 className="game-card-title">{game.name}</h2>
                </div>
                <p className="game-card-desc">{game.description}</p>
                <div className="game-card-meta">
                  <span className="badge badge-players">👥 {game.players}</span>
                  <span className="badge badge-play">Play →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="games-sidebar">
        <div className="public-lobbies">
          <h2>Public Lobbies</h2>
          <div className="lobbies-list">
            {publicLobbies.length === 0 ? (
              <p className="no-lobbies">No public lobbies right now. Be the first to create one!</p>
            ) : (
              publicLobbies.map(lobby => (
                <div key={lobby.id} className="public-lobby-card">
                  <div className="lobby-info">
                    <h4>{lobby.name}</h4>
                    <span className="lobby-game">{prettyGame(lobby.currentGame)}</span>
                    <span className="lobby-host">by {displayNameFor(lobby.host, names)}</span>
                  </div>
                  <div className="lobby-stats">
                    <span className={lobby.status === "PLAYING" ? "lobby-playing" : ""}>
                      {lobby.status === "PLAYING" ? "▶ In game" : `👥 ${lobby.playerCount}/${lobby.maxPlayers ?? 8}`}
                    </span>
                    <button
                      onClick={() => router.push(`/games/lobby/${lobby.id}`)}
                      className="btn-join"
                      disabled={lobby.status === "PLAYING" || lobby.playerCount >= (lobby.maxPlayers ?? 8)}
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <form className="join-code-box" onSubmit={handleJoinCode}>
          <label>Have an invite code or link?</label>
          <div className="join-code-row">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              placeholder="Paste code or link"
            />
            <button type="submit" className="btn-join" disabled={!joinCode.trim()}>Go</button>
          </div>
        </form>
      </aside>

      {showCreateModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="modal-content glass-panel">
            <h2>Create Lobby</h2>
            <form onSubmit={handleCreateLobby} className="create-lobby-form">
              <div className="form-group">
                <label>Lobby Name</label>
                <input
                  type="text"
                  value={lobbyName}
                  onChange={e => setLobbyName(e.target.value)}
                  placeholder="My Awesome Lobby"
                  maxLength={40}
                />
              </div>

              <div className="form-group">
                <label>Starting Game</label>
                <select value={selectedGame} onChange={e => setSelectedGame(e.target.value)}>
                  <option value="none">Just hanging out...</option>
                  {GAMES.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {selectedGame !== "none" && (
                <div className="form-group">
                  <label>Language</label>
                  <div className="lang-toggle">
                    <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>🇬🇧 English</button>
                    <button type="button" className={language === "fr" ? "active" : ""} onClick={() => setLanguage("fr")}>🇫🇷 Français</button>
                  </div>
                </div>
              )}

              <div className="form-group checkbox">
                <label>
                  <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
                  Private Lobby
                </label>
              </div>

              {isPrivate && (
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required={isPrivate}
                  />
                </div>
              )}

              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating || !isAuthed}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
