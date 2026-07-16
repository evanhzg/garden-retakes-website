"use client";

import React, { useState, useEffect } from "react";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import "./cah.css";
const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000);

export default function CahGame() {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState<any>(null);
  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [customTexts, setCustomTexts] = useState<string[]>([]);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on("cah_state", (state: any) => {
        setGameState(state);
      });
    }
    return () => { if (socket) socket.off("cah_state"); };
  }, [socket]);

  // Clear local inputs only when a new round starts or phase changes to SUBMIT
  useEffect(() => {
    if (gameState?.phase === 'SUBMIT') {
      setSelectedCards([]);
      setCustomTexts(new Array(gameState.currentBlack?.pick || 1).fill(""));
      setShowCustom(false);
    }
  }, [gameState?.round, gameState?.phase]);

  const submitCards = () => { socket?.emit("cah_submit", { cardIds: selectedCards }); setSelectedCards([]); };
  const submitCustom = () => { socket?.emit("cah_submit_custom", { customTexts }); setShowCustom(false); };
  const pickWinner = (pid: string) => socket?.emit("cah_pick_winner", { winnerPlayerId: pid });
  const nextRound = () => socket?.emit("cah_next_round");
  const returnLobby = () => socket?.emit("lobby_return");
  const toggleCard = (cardId: number) => {
    const pick = gameState?.currentBlack?.pick || 1;
    if (selectedCards.includes(cardId)) {
      setSelectedCards(selectedCards.filter(id => id !== cardId));
    } else if (selectedCards.length < pick) {
      setSelectedCards([...selectedCards, cardId]);
    }
  };

  if (!gameState || gameState.status === 'WAITING') {
    return null;
  }

  // --- Game ---
  const isCzar = gameState.czar === DUMMY_STEAM_ID;
  const alreadySubmitted = gameState.submittedPlayers.includes(DUMMY_STEAM_ID);

  return (
    <div className="cah-container">
      <div className="cah-game-layout">
        {/* Scores */}
        <div className="cah-scores-bar">
          {gameState.players.map((p: string) => {
            const name = p.startsWith('BOT_') ? `Bot ${p.slice(-4)}` : `P-${p.slice(-4)}`;
            return (
              <div key={p} className={`cah-score-chip ${gameState.czar === p ? 'czar' : ''}`}>
                <span>{name} {gameState.czar === p ? '👑' : ''}</span>
                <span className="score-num">{gameState.scores[p]}</span>
              </div>
            );
          })}
        </div>

        {/* Center */}
        <div className="cah-center">
          <div className="cah-phase-label">
            Round {gameState.round}/{gameState.maxRounds} — {gameState.phase === 'SUBMIT' ? 'Submit your cards' : gameState.phase === 'JUDGE' ? 'Card Czar is judging' : 'Winner revealed!'}
            {gameState.timeLeft !== null && (
              <span style={{ marginLeft: '10px', color: gameState.timeLeft <= 10 ? '#ef4444' : '#f59e0b', fontWeight: 'bold' }}>
                ⏱️ {gameState.timeLeft}s
              </span>
            )}
          </div>

          {gameState.currentBlack && (
            <div className="cah-black-card">
              {gameState.currentBlack.text}
            </div>
          )}

          {/* Judging / Reveal */}
          {(gameState.phase === 'JUDGE' || gameState.phase === 'REVEAL') && gameState.revealedSubmissions.length > 0 && (
            <div className="cah-submissions">
              {gameState.revealedSubmissions.map((sub: any, i: number) => (
                <div
                  key={i}
                  className={`cah-submission-card ${gameState.roundWinner === sub.playerId ? 'winner' : ''}`}
                  onClick={() => isCzar && gameState.phase === 'JUDGE' && pickWinner(sub.playerId)}
                  style={{ cursor: isCzar && gameState.phase === 'JUDGE' ? 'pointer' : 'default' }}
                >
                  {sub.cards.map((c: any) => c.text).join(' / ')}
                </div>
              ))}
            </div>
          )}

          {gameState.phase === 'REVEAL' && gameState.players[0] === DUMMY_STEAM_ID && (
            <button className="btn-primary" onClick={gameState.status === 'FINISHED' ? returnLobby : nextRound} style={{ background: '#fff', color: '#000' }}>
              {gameState.status === 'FINISHED' ? 'Return to Lobby' : 'Next Round'}
            </button>
          )}

          {gameState.status === 'FINISHED' && (
            <div className="cah-history-recap" style={{ background: '#1a1a1a', padding: '16px', borderRadius: '8px', border: '1px solid #333', marginTop: '16px' }}>
              <h3 style={{ color: '#fff', marginBottom: '16px', textAlign: 'center' }}>Game Recap</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {gameState.history?.map((h: any, i: number) => (
                  <div key={i} style={{ background: '#000', padding: '12px', borderRadius: '6px', border: '1px solid #222' }}>
                    <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '4px' }}>Round {h.round} • Winner: {h.winner}</div>
                    <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}>{h.blackCard}</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {h.whiteCards.map((w: string, j: number) => (
                        <span key={j} style={{ background: '#fff', color: '#000', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold' }}>{w}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {gameState.players[0] === DUMMY_STEAM_ID && (
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <button className="btn-primary" onClick={returnLobby} style={{ background: '#fff', color: '#000' }}>Return to Lobby</button>
                </div>
              )}
            </div>
          )}

          {gameState.status === 'FINISHED' && gameState.players[0] !== DUMMY_STEAM_ID && (
            <div style={{ color: '#888', fontSize: '0.9rem', textAlign: 'center', marginTop: '16px' }}>Waiting for host to return to lobby...</div>
          )}
        </div>

        {/* Hand (only during SUBMIT, and not czar) */}
        {gameState.phase === 'SUBMIT' && !isCzar && !alreadySubmitted && (
          <div>
            {!showCustom ? (
              <>
                <div className="cah-hand">
                  {gameState.hand.map((card: any) => (
                    <div
                      key={card.id}
                      className={`cah-white-card ${selectedCards.includes(card.id) ? 'selected' : ''}`}
                      onClick={() => toggleCard(card.id)}
                    >
                      {card.text}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px', gap: '12px' }}>
                  <button
                    className="btn-primary"
                    onClick={submitCards}
                    disabled={selectedCards.length !== (gameState.currentBlack?.pick || 1)}
                    style={{ background: '#fff', color: '#000' }}
                  >
                    Submit ({selectedCards.length}/{gameState.currentBlack?.pick || 1})
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowCustom(true)}
                    style={{ borderColor: '#444', color: '#ccc' }}
                  >
                    Write Custom Card
                  </button>
                </div>
              </>
            ) : (
              <div style={{ background: '#111', padding: '16px', borderRadius: '8px', border: '1px solid #333' }}>
                <h3 style={{ color: '#fff', marginBottom: '12px', textAlign: 'center' }}>Write your custom answer</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {customTexts.map((txt, i) => (
                    <input
                      key={i}
                      value={txt}
                      onChange={e => { const c = [...customTexts]; c[i] = e.target.value; setCustomTexts(c); }}
                      placeholder={`Custom card ${i + 1}...`}
                      style={{ padding: '10px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px', gap: '12px' }}>
                  <button
                    className="btn-primary"
                    onClick={submitCustom}
                    disabled={customTexts.some(t => !t.trim())}
                    style={{ background: '#fff', color: '#000' }}
                  >
                    Submit Custom
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowCustom(false)}
                    style={{ borderColor: '#444', color: '#ccc' }}
                  >
                    Cancel
                  </button>
                </div>
                <p style={{ textAlign: 'center', color: '#666', fontSize: '0.8rem', marginTop: '8px' }}>
                  AI will check spelling & capitalize automatically!
                </p>
              </div>
            )}
          </div>
        )}

        {gameState.phase === 'SUBMIT' && (isCzar || alreadySubmitted) && (
          <div style={{ textAlign: 'center', color: '#666', padding: '16px' }}>
            {isCzar ? 'You are the Card Czar. Waiting for submissions...' : 'Cards submitted! Waiting for others...'}
            <br />
            <span style={{ fontSize: '0.8rem' }}>{gameState.submittedPlayers.length}/{gameState.players.length - 1} submitted</span>
          </div>
        )}

        {/* Logs */}
        <div className="cah-logs">
          {gameState.logs.map((l: any) => (
            <span key={l.id}>{l.text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
