"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import "./skribbl.css";
const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000);

const COLORS = ["#000000", "#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#f97316", "#06b6d4", "#78716c", "#8b5cf6"];
const SIZES = [3, 6, 12, 24];

export default function SkribblGame() {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState<any>(null);
  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [drawColor, setDrawColor] = useState("#000000");
  const [drawSize, setDrawSize] = useState(6);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on("skribbl_state", (state: any) => setGameState(state));
      socket.on("skribbl_draw", (data: any) => {
        drawOnCanvas(data);
      });
    }
    return () => {
      if (socket) {
        socket.off("skribbl_state");
        socket.off("skribbl_draw");
      }
    };
  }, [socket]);

  // Redraw entire canvas when drawingData changes (initial load)
  useEffect(() => {
    if (gameState?.drawingData && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      gameState.drawingData.forEach((d: any) => drawOnCanvas(d));
    }
  }, [gameState?.phase]);

  const drawOnCanvas = useCallback((data: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (data.type === 'clear') {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (data.type === 'line') {
      ctx.beginPath();
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(data.x1 * canvas.width, data.y1 * canvas.height);
      ctx.lineTo(data.x2 * canvas.width, data.y2 * canvas.height);
      ctx.stroke();
    }
  }, []);

  const getCanvasPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!gameState?.isDrawer || gameState.phase !== 'DRAWING') return;
    isDrawingRef.current = true;
    lastPosRef.current = getCanvasPos(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || !lastPosRef.current) return;
    const pos = getCanvasPos(e);
    const data = { type: 'line', x1: lastPosRef.current.x, y1: lastPosRef.current.y, x2: pos.x, y2: pos.y, color: drawColor, size: drawSize };
    drawOnCanvas(data);
    socket?.emit("skribbl_draw_data", data);
    lastPosRef.current = pos;
  };

  const handleMouseUp = () => { isDrawingRef.current = false; lastPosRef.current = null; };

  const clearCanvas = () => {
    socket?.emit("skribbl_clear");
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const submitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;
    socket?.emit("skribbl_guess", { text: guessInput });
    setGuessInput("");
  };

  const chooseWord = (idx: number) => socket?.emit("skribbl_choose_word", { wordIndex: idx });
  const nextTurn = () => socket?.emit("skribbl_next_turn");
  const returnLobby = () => socket?.emit("lobby_return");

  if (!gameState || gameState.status === 'WAITING') {
    return null;
  }

  // --- Game ---
  const drawerName = gameState.currentDrawer?.startsWith('BOT_') ? `Bot ${gameState.currentDrawer.slice(-4)}` : `P-${gameState.currentDrawer?.slice(-4)}`;

  return (
    <div className="skribbl-container" style={{ position: 'relative' }}>
      {/* Round end overlay */}
      {gameState.phase === 'ROUND_END' && (
        <div className="skr-round-end">
          <div style={{ color: 'var(--muted)', fontSize: '1rem' }}>The word was</div>
          <div className="skr-revealed-word">{gameState.revealedWord}</div>
          {gameState.players[0] === DUMMY_STEAM_ID && (
            <button className="btn-primary" onClick={gameState.status === 'FINISHED' ? returnLobby : nextTurn}>
              {gameState.status === 'FINISHED' ? 'Return to Lobby' : 'Next Turn'}
            </button>
          )}
        </div>
      )}

      <div className="skr-game-layout">
        {/* Top bar */}
        <div className="skr-top-bar">
          <span className="skr-round-info">Round {gameState.round + 1}/{gameState.maxRounds} — {drawerName} is drawing</span>
          <span className="skr-word-hint">{gameState.isDrawer ? gameState.word : gameState.hint}</span>
          <span className={`skr-timer ${gameState.timeLeft < 20 ? 'warning' : ''}`}>{gameState.timeLeft}s</span>
        </div>

        {/* Canvas */}
        <div className="skr-canvas-area">
          {/* Word choices for drawer */}
          {gameState.phase === 'CHOOSING' && gameState.isDrawer && (
            <div className="skr-word-choices">
              {gameState.wordChoices.map((w: string, i: number) => (
                <button key={i} className="skr-word-choice" onClick={() => chooseWord(i)}>{w}</button>
              ))}
            </div>
          )}

          {gameState.phase === 'CHOOSING' && !gameState.isDrawer && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              {drawerName} is choosing a word...
            </div>
          )}

          {(gameState.phase === 'DRAWING' || gameState.phase === 'ROUND_END') && (
            <>
              <div className="skr-canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={500}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>
              {/* Drawing tools (only for drawer) */}
              {gameState.isDrawer && gameState.phase === 'DRAWING' && (
                <div className="skr-tools">
                  {COLORS.map(c => (
                    <div
                      key={c}
                      className={`skr-color-btn ${drawColor === c ? 'active' : ''}`}
                      style={{ background: c, border: c === '#ffffff' ? '2px solid #ccc' : undefined }}
                      onClick={() => setDrawColor(c)}
                    />
                  ))}
                  <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                  {SIZES.map(s => (
                    <button key={s} className={`skr-size-btn ${drawSize === s ? 'active' : ''}`} onClick={() => setDrawSize(s)}>
                      {s}px
                    </button>
                  ))}
                  <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                  <button className="skr-clear-btn" onClick={clearCanvas}>Clear</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Chat / Scores panel */}
        <div className="skr-chat-panel">
          <div className="skr-scoreboard">
            {gameState.players.map((p: string) => {
              const name = p.startsWith('BOT_') ? `Bot ${p.slice(-4)}` : `P-${p.slice(-4)}`;
              const isDrawer = p === gameState.currentDrawer;
              const hasGuessed = gameState.chatMessages?.some((m: any) => m.type === 'correct' && m.from === name);
              return (
                <div key={p} className={`skr-score-row ${isDrawer ? 'drawing' : ''} ${hasGuessed ? 'guessed' : ''}`}>
                  <span>{isDrawer ? '✏️ ' : ''}{name}</span>
                  <span className="score-pts">{gameState.scores[p]}</span>
                </div>
              );
            })}
          </div>

          <div className="skr-messages">
            {gameState.chatMessages?.map((msg: any, i: number) => (
              <div key={i} className={`skr-msg ${msg.type}`}>
                {msg.type === 'correct' ? (
                  <span>{msg.text}</span>
                ) : msg.type === 'close' ? (
                  <span><span className="msg-name">{msg.from}:</span> {msg.text} (close!)</span>
                ) : (
                  <span><span className="msg-name">{msg.from}:</span> {msg.text}</span>
                )}
              </div>
            ))}
          </div>

          {/* Guess input (not drawer, not guessed) */}
          {!gameState.isDrawer && gameState.phase === 'DRAWING' && !gameState.hasGuessed && (
            <form className="skr-chat-input" onSubmit={submitGuess}>
              <input
                value={guessInput}
                onChange={e => setGuessInput(e.target.value)}
                placeholder="Type your guess..."
              />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
