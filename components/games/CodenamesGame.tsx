"use client";

import React, { useState, useEffect } from "react";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import "./codenames.css";
const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000);

export default function CodenamesGame() {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState<any>(null);
  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [clueWord, setClueWord] = useState("");
  const [clueCount, setClueCount] = useState(1);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on("codenames_state", (state: any) => setGameState(state));
    }
    return () => { if (socket) socket.off("codenames_state"); };
  }, [socket]);

  const giveClue = () => { socket?.emit("codenames_clue", { word: clueWord, count: clueCount }); setClueWord(""); };
  const guessCard = (idx: number) => socket?.emit("codenames_guess", { cardIndex: idx });
  const endGuessing = () => socket?.emit("codenames_end_guessing");

  if (!gameState || gameState.status === 'WAITING') {
    return null;
  }
  
  const isHost = gameState.players[0] === DUMMY_STEAM_ID;

  // --- Game ---
  const myTeam = gameState.teams.red.includes(DUMMY_STEAM_ID) ? 'red' : 'blue';
  const isSpymaster = gameState.spymasters[myTeam] === DUMMY_STEAM_ID;
  const isMyTeamTurn = gameState.currentTeam === myTeam;
  const canGuess = isMyTeamTurn && !isSpymaster && gameState.phase === 'GUESS';
  const canClue = isMyTeamTurn && isSpymaster && gameState.phase === 'CLUE';

  return (
    <div className="codenames-container" style={{ position: 'relative' }}>
      {gameState.status === 'FINISHED' && (
        <div className="cn-winner-overlay">
          <div className={`cn-winner-text ${gameState.winner}`}>
            {gameState.winner?.toUpperCase()} TEAM WINS!
          </div>
        </div>
      )}

      <div className="cn-game-layout">
        {/* Red Team Panel */}
        <div className="cn-team-panel red">
          <div className="cn-team-title red">RED TEAM</div>
          {gameState.teams.red.map((p: string) => (
            <div key={p} className="flex justify-between items-center bg-gray-800/50 p-3 rounded border border-gray-700/50">
              <span>
                {p.startsWith('BOT_') ? `🤖 Bot ${p.slice(-4)}` : `P-${p.slice(-4)}`}
                {gameState.spymasters.red === p && ' 🕵️'}
              </span>
            </div>
          ))}
          <div className="cn-remaining red">{gameState.remaining.red}</div>
        </div>

        {/* Board Area */}
        <div className="cn-board-area">
          <div className="cn-status-bar">
            <span className={`cn-turn-indicator ${gameState.currentTeam}`}>
              {gameState.currentTeam === 'red' ? '🔴' : '🔵'} {gameState.currentTeam.toUpperCase()}'s turn
            </span>
            <span style={{ color: 'var(--muted)' }}>•</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {gameState.phase === 'CLUE' ? 'Spymaster giving clue...' : `Guessing (${gameState.guessesLeft} left)`}
            </span>
            {gameState.currentClue && (
              <span className="cn-clue-display">
                Clue: <strong>{gameState.currentClue.word}</strong> — {gameState.currentClue.count}
              </span>
            )}
          </div>

          <div className="cn-grid">
            {gameState.board.map((card: any, idx: number) => {
              const isRevealed = gameState.revealed[idx];
              const typeClass = isRevealed ? `revealed type-${card.type}` : '';
              const spyHint = !isRevealed && isSpymaster && card.type !== 'hidden' ? `spy-hint-${card.type}` : '';
              return (
                <div
                  key={idx}
                  className={`cn-card ${typeClass} ${spyHint}`}
                  onClick={() => canGuess && !isRevealed && guessCard(idx)}
                >
                  {card.word}
                </div>
              );
            })}
          </div>

          {/* Clue Input for Spymaster */}
          {canClue && (
            <div className="cn-clue-input">
              <input
                type="text"
                value={clueWord}
                onChange={e => setClueWord(e.target.value)}
                placeholder="Your clue..."
                onKeyDown={e => e.key === 'Enter' && giveClue()}
              />
              <input
                type="number"
                min={0}
                max={9}
                value={clueCount}
                onChange={e => setClueCount(parseInt(e.target.value) || 0)}
              />
              <button className="btn-primary" onClick={giveClue} disabled={!clueWord.trim()} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                Give Clue
              </button>
            </div>
          )}

          {/* End Guessing Button */}
          {canGuess && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={endGuessing}>End Guessing</button>
            </div>
          )}

          {/* Logs */}
          <div className="cn-logs">
            {gameState.logs.map((l: any) => (
              <div key={l.id} className="cn-log-entry">{l.text}</div>
            ))}
          </div>
        </div>

        {/* Blue Team Panel */}
        <div className="cn-team-panel blue">
          <div className="cn-team-title blue">BLUE TEAM</div>
          {gameState.teams.blue.map((p: string) => (
            <div key={p} className="cn-team-player">
              <span>{p.startsWith('BOT_') ? `🤖 Bot ${p.slice(-4)}` : `P-${p.slice(-4)}`}</span>
              {gameState.spymasters.blue === p && <span className="role-badge spymaster">SPY</span>}
            </div>
          ))}
          <div className="cn-remaining blue">{gameState.remaining.blue}</div>
        </div>
      </div>
    </div>
  );
}
