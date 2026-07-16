"use client";

import React, { useState, useEffect } from "react";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import "./meme.css";
const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000);

export default function MemeGame() {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState<any>(null);
  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [captions, setCaptions] = useState<string[]>([""]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on("meme_state", (state: any) => {
        setGameState(state);
      });
    }
    return () => { if (socket) socket.off("meme_state"); };
  }, [socket]);

  useEffect(() => {
    if (gameState?.phase === 'CAPTION' && gameState?.currentTemplate) {
      setCaptions(new Array(gameState.currentTemplate.slots || 1).fill(""));
    }
  }, [gameState?.round, gameState?.phase]);

  const submitCaption = () => socket?.emit("meme_caption", { captions });
  const vote = (targetId: string) => socket?.emit("meme_vote", { targetPlayerId: targetId });
  const nextRound = () => socket?.emit("meme_next_round");
  const returnLobby = () => socket?.emit("lobby_return");

  if (!gameState || gameState.status === 'WAITING') {
    return null;
  }

  // --- Game ---
  const hasSubmitted = gameState.submittedPlayers.includes(DUMMY_STEAM_ID);
  const hasVoted = gameState.votedPlayers.includes(DUMMY_STEAM_ID);

  return (
    <div className="meme-container">
      <div className="meme-game-layout">
        {/* Scores */}
        <div className="meme-scores-bar">
          {gameState.players.map((p: string) => {
            const name = p.startsWith('BOT_') ? `Bot ${p.slice(-4)}` : `P-${p.slice(-4)}`;
            return (
              <div key={p} className="meme-score-chip">
                <span>{name}</span>
                <span className="score-val">{gameState.scores[p]}</span>
              </div>
            );
          })}
        </div>

        <div className="meme-phase-label">
          Round {gameState.round}/{gameState.maxRounds} — {gameState.phase === 'CAPTION' ? 'Write your caption' : gameState.phase === 'VOTE' ? 'Vote for the best' : 'Results'}
        </div>

        {/* Template */}
        <div className="meme-template-area">
          {gameState.currentTemplate && (
            <>
              <div className="meme-template-name">{gameState.currentTemplate.name}</div>
              <img src={gameState.currentTemplate.url} alt={gameState.currentTemplate.name} className="meme-template-img" />
            </>
          )}

          {/* Caption Phase */}
          {gameState.phase === 'CAPTION' && !hasSubmitted && (
            <>
              <div className="meme-caption-inputs">
                {captions.map((cap, i) => (
                  <input
                    key={i}
                    value={cap}
                    onChange={e => { const c = [...captions]; c[i] = e.target.value; setCaptions(c); }}
                    placeholder={`Caption ${i + 1}...`}
                  />
                ))}
              </div>
              <button className="btn-primary" onClick={submitCaption} disabled={captions.every(c => !c.trim())}>
                Submit Caption
              </button>
            </>
          )}

          {gameState.phase === 'CAPTION' && hasSubmitted && (
            <div style={{ color: 'var(--muted)' }}>Waiting for others... ({gameState.submittedPlayers.length}/{gameState.players.length})</div>
          )}

          {/* Vote Phase */}
          {gameState.phase === 'VOTE' && !hasVoted && (
            <div className="meme-vote-gallery">
              {gameState.roundResults.map((r: any, i: number) => (
                <div key={i} className="meme-vote-card" onClick={() => vote(r.playerId)}>
                  <span className="caption-text">{r.captions.join(' / ')}</span>
                </div>
              ))}
            </div>
          )}

          {gameState.phase === 'VOTE' && hasVoted && (
            <div style={{ color: 'var(--muted)' }}>Vote cast! Waiting... ({gameState.votedPlayers.length}/{gameState.players.length})</div>
          )}

          {/* Results */}
          {gameState.phase === 'RESULTS' && (
            <>
              <div className="meme-vote-gallery">
                {gameState.roundResults.map((r: any, i: number) => {
                  const name = r.playerId?.startsWith('BOT_') ? `Bot ${r.playerId.slice(-4)}` : `P-${r.playerId?.slice(-4)}`;
                  return (
                    <div key={i} className={`meme-vote-card ${i === 0 ? 'winner-card' : ''}`}>
                      <span className="caption-text">{r.captions.join(' / ')}</span>
                      <span className="vote-count">{r.voteCount} ★</span>
                      {r.playerId && <span className="winner-name">{name}</span>}
                    </div>
                  );
                })}
              </div>
              {gameState.players[0] === DUMMY_STEAM_ID && (
                <button className="btn-primary" onClick={gameState.status === 'FINISHED' ? returnLobby : nextRound}>
                  {gameState.status === 'FINISHED' ? 'Return to Lobby' : 'Next Round'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Logs */}
        <div className="meme-logs">
          {gameState.logs.map((l: any) => (
            <span key={l.id}>{l.text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
