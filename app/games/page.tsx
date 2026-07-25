"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { useGameIdentity, usePlayerNames, displayNameFor } from "@/components/games/hooks";
import GameIcon from "@/components/games/GameIcon";
import "./games.css";

// The hub is grouped into categories so the party games and the daily
// esports guessers don't compete for the same shelf.
//
// `ready: false` games are visible but greyed out. `solo` games have a page of
// their own, so their card links there instead of spinning up a lobby.
type HubGame = {
  id: string;
  name: string;
  description: string;
  players: string;
  ready: boolean;
  solo?: string;
  daily?: boolean;
  quiz?: boolean;
  franchise?: string;
};

type HubCategory = { id: string; title: string; blurb: string; games: HubGame[] };

const CATEGORIES: HubCategory[] = [
  {
    id: "party",
    title: "Party games",
    blurb: "Spin up a lobby and play with friends or bots",
    games: [
      { id: "monopoly", name: "MONOPO7Y", description: "Business Tour-style fast property trading with 3D dice physics, auctions, and ruthless bot AI.", players: "2–4", ready: true },
      { id: "uno", name: "OUNO", description: "Card battles with house rules: stacking, jump-ins, 7-0 swaps, optional cards — and a timed OUNO call that punishes you for forgetting.", players: "2–4", ready: true },
      { id: "skribbl", name: "FREE-DRAW", description: "One draws, everyone guesses. Real-time canvas, fuzzy matching, and timed rounds in English or French.", players: "2–8", ready: true },
      { id: "meme", name: "HASAMEME", description: "Caption templates or answer with the perfect GIF — pick packs, import your own memes, then vote for the funniest.", players: "3–8", ready: true },
      { id: "codenames", name: "CODENAMES", description: "Two teams, one spymaster each. One-word clues, 5×5 or 6×6 boards, swappable word packs, clocks and a double agent — but avoid the assassin.", players: "4–8", ready: true },
      { id: "cah", name: "PILE OF...", description: "Fill in the blank with the most outrageous card. The Card Czar picks a winner each round — or write your own.", players: "3–8", ready: true },
    ],
  },
  {
    id: "esports",
    title: "Esports daily & quiz",
    blurb: "A new puzzle every day, the same one for everyone — solo or as a race",
    games: [
      { id: "headshot", name: "HEADSHOT", franchise: "CS2", description: "Guess the Counter-Strike pro from nationality, team, role, age and Majors. One a day for everyone — or race your friends to five.", players: "1–8", ready: true, solo: "/games/headshot", daily: true },
      { id: "buymenu", name: "BUY MENU", franchise: "CS2", description: "Weapons, utility, economy and map knowledge — pick the right buy for the round. Four difficulty tiers from Silver to Global.", players: "1–8", ready: false, solo: "/games/buymenu", quiz: true },
      { id: "pentakill", name: "PENTAKILL", franchise: "LoL", description: "Guess the champion from role, region, resource, range, release year and more. Fresh champion every day.", players: "1–8", ready: false, solo: "/games/pentakill", daily: true },
      { id: "buildpath", name: "BUILD PATH", franchise: "LoL", description: "Items, runes and matchups — pick the best build for the champion and the situation. Four difficulty tiers from Iron to Challenger.", players: "1–8", ready: false, solo: "/games/buildpath", quiz: true },
      { id: "dropship", name: "DROPSHIP", franchise: "Apex", description: "Guess the Legend from class, homeworld, passive and release season.", players: "1–8", ready: false, daily: true },
      { id: "loadout", name: "LOADOUT", franchise: "Apex", description: "Guns, attachments and rotations — build the right loadout for the ring.", players: "1–8", ready: false, quiz: true },
    ],
  },
];

const GAMES = CATEGORIES.flatMap((c) => c.games);

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

function MiniLadder() {
  const [topPlayers, setTopPlayers] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/games/ladder?gameId=all')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTopPlayers(data.slice(0, 5));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="hub-panel mt-4" style={{ marginTop: '1rem' }}>
      <div className="hub-panel-head">
        <h2>Top Players</h2>
        <Link href="/games/ladder" className="hub-live" style={{ color: 'var(--text-dim)' }}>View all →</Link>
      </div>
      <div className="lobbies-list">
        {topPlayers.length === 0 ? (
          <p className="no-lobbies">No ranked players yet.</p>
        ) : (
          topPlayers.map((p, i) => (
            <div key={`${p.steamId}-${p.gameId}`} className="public-lobby-card" style={{ padding: '0.75rem', gap: '0.5rem' }}>
              <div className="lobby-info" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-dim)', fontWeight: 'bold' }}>#{i + 1}</span>
                  <Link href={`/profile/${p.steamId}`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 500 }}>{p.name}</Link>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#ffb800', fontWeight: 'bold' }}>{p.elo} <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>ELO</span></div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{p.gameId.toUpperCase()}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function GamesHub() {
  const router = useRouter();
  const { socket, isAuthed, steamId } = useSocket();
  const [publicLobbies, setPublicLobbies] = useState<any[]>([]);
  const [myLobby, setMyLobby] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    try { const v = localStorage.getItem("games_hub_view"); if (v === "list" || v === "grid") setView(v); } catch {}
  }, []);
  const setViewPersist = (v: "grid" | "list") => { setView(v); try { localStorage.setItem("games_hub_view", v); } catch {} };

  const hostIds = publicLobbies.map(l => l.host);
  const names = usePlayerNames(hostIds);

  useEffect(() => {
    if (!socket) return;
    socket.on("public_lobbies_sync", (lobbies) => {
      setPublicLobbies(lobbies);
      // Lobbies changed — re-check whether ours is still alive to rejoin.
      socket.emit("get_my_lobby");
    });
    socket.on("my_lobby", (lobby) => setMyLobby(lobby));
    return () => {
      socket.off("public_lobbies_sync");
      socket.off("my_lobby");
    };
  }, [socket]);

  // Ask for the current list + any lobby we can rejoin as soon as we're authed —
  // without this the sidebar stays empty until some lobby happens to change.
  useEffect(() => {
    if (socket && isAuthed) {
      socket.emit("get_public_lobbies");
      socket.emit("get_my_lobby");
    }
  }, [socket, isAuthed]);

  // Clicking a game (or "Create Lobby") spins up a lobby immediately and drops
  // you into it — privacy, language and the rest are set from the lobby page.
  const createLobby = (gameId: string) => {
    if (!socket || !isAuthed || creating) return;
    setCreating(true);
    socket.emit("lobby_create", {
      name: `Player ${(steamId || "").slice(-4)}'s Lobby`,
      isPrivate: false,
      password: "",
      currentGame: gameId === "none" ? "none" : `${gameId}_en`,
    });
    socket.once("lobby_state", (state) => { router.push(`/games/lobby/${state.id}`); });
  };

  const handleJoinCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().split("/").pop();
    if (code) router.push(`/games/lobby/${code}`);
  };

  const readyCount = GAMES.filter(g => g.ready).length;

  return (
    <div className="hub">
      <div className="hub-aurora" aria-hidden />
      <div className="hub-inner">
        <section className="hub-hero">
          <div className="hub-hero-text">
            <span className="hub-kicker">Garden · Party Games</span>
            <h1>GAMES HUB</h1>
            <p>Spin up a universal lobby and play with friends or bots.</p>
          </div>
          <div className="hub-hero-side">
            <div className="hub-stats">
              <div className="hub-stat"><b>{readyCount}</b><span>games live</span></div>
              <div className="hub-stat"><b>{publicLobbies.length}</b><span>open lobbies</span></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="hub-create" onClick={() => createLobby("none")} disabled={creating}>
                <span className="hub-create-plus">+</span> {creating ? "Creating…" : "Create Lobby"}
              </button>
              <Link href="/games/ladder" className="hub-create" style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}>
                🏆 Ladder
              </Link>
            </div>
          </div>
        </section>

        {myLobby && (
          <button className="rejoin-banner" onClick={() => router.push(`/games/lobby/${myLobby.lobbyId}`)}>
            <span className="rejoin-pulse" />
            <span className="rejoin-text">
              <b>{myLobby.member ? "You're in a lobby" : "Rejoin your lobby"}</b>
              <span>{myLobby.name} · {myLobby.playerCount}/{myLobby.maxPlayers ?? 8} players{myLobby.status === "PLAYING" ? " · in game" : ""}</span>
            </span>
            <span className="rejoin-cta">{myLobby.member ? "Return →" : "Rejoin →"}</span>
          </button>
        )}
        
        {!isAuthed && (
          <div className="socket-loading-banner">
            <div className="socket-spinner"></div>
            <span>Connecting to Games Server...</span>
          </div>
        )}

        <div className="hub-body">
          <div className="hub-games">
            <div className="hub-section-head">
              <h2>Choose a game</h2>
              <div className="hub-view-toggle" role="group" aria-label="View">
                <button className={view === "grid" ? "on" : ""} onClick={() => setViewPersist("grid")} title="Grid" aria-label="Grid view">
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>
                </button>
                <button className={view === "list" ? "on" : ""} onClick={() => setViewPersist("list")} title="List" aria-label="List view">
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><rect x="2" y="3" width="16" height="3" rx="1.5"/><rect x="2" y="8.5" width="16" height="3" rx="1.5"/><rect x="2" y="14" width="16" height="3" rx="1.5"/></svg>
                </button>
              </div>
            </div>
            {CATEGORIES.map((cat, ci) => (
              <section key={cat.id} className="hub-category">
                {ci > 0 && (
                  <div className="hub-category-head">
                    <h3>{cat.title}</h3>
                    <span>{cat.blurb}</span>
                  </div>
                )}
                <div className={view === "list" ? "games-list" : "games-grid"}>
                  {cat.games.map((game) => {
                    const inner = (
                      <>
                        <div className="game-card-bg" />
                        <div className="game-card-content">
                          <div className="game-card-top">
                            <span className="game-card-icon"><GameIcon id={game.id} size={34} title={game.name} /></span>
                            <h2 className="game-card-title">{game.name}</h2>
                            {game.franchise && <span className={`game-card-franchise fr-${game.franchise.toLowerCase()}`}>{game.franchise}</span>}
                          </div>
                          <p className="game-card-desc">{game.description}</p>
                          <div className="game-card-meta">
                            <span className="badge badge-players">👥 {game.players}</span>
                            {game.daily && <span className="badge badge-daily">🗓 Daily</span>}
                            {game.quiz && <span className="badge badge-quiz">🧠 Quiz</span>}
                            {game.ready && game.solo && <span className="badge badge-solo">Solo or friends</span>}
                            {game.ready
                              ? <span className="badge badge-play">Play →</span>
                              : <span className="badge badge-coming">Coming soon</span>}
                          </div>
                        </div>
                      </>
                    );

                    // Games with their own page are plain links, so they work
                    // without a socket connection (and open in a new tab on
                    // middle-click like any other link).
                    if (game.ready && game.solo) {
                      return (
                        <Link key={game.id} href={game.solo} className="game-card" data-game={game.id}>
                          {inner}
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={game.id}
                        className={`game-card ${game.ready ? "" : "coming-soon"}`}
                        data-game={game.id}
                        onClick={() => game.ready && createLobby(game.id)}
                        role="button"
                        aria-disabled={!game.ready}
                        tabIndex={game.ready ? 0 : -1}
                        onKeyDown={(e) => { if (e.key === "Enter" && game.ready) createLobby(game.id); }}
                      >
                        {inner}
                      </div>
                    );
                  })}
                  {ci === 0 && (
                    <div className="game-card game-card-more" aria-hidden>
                      <div className="game-card-more-inner">
                        <span className="game-card-more-plus">✦</span>
                        <span className="game-card-more-text">More games<br />coming soon</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>

          <aside className="hub-side">
            <div className="hub-panel">
              <div className="hub-panel-head">
                <h2>Public lobbies</h2>
                <span className="hub-live"><span className="hub-live-dot" /> live</span>
              </div>
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
            </div>
            
            <MiniLadder />
          </aside>
        </div>
      </div>
    </div>
  );
}
