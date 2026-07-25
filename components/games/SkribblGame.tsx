"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import { useGameLang, translator, LangToggle, SKRIBBL } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import "./shared.css";
import "./skribbl.css";

const COLORS = [
  "#000000", "#7f7f7f", "#c1c1c1", "#ffffff",
  "#ef4444", "#f97316", "#f59e0b", "#fde047",
  "#22c55e", "#065f46", "#06b6d4", "#3b82f6",
  "#1e3a8a", "#a855f7", "#ec4899", "#78350f",
];
const SIZES = [3, 7, 14, 26];
const CANVAS_W = 900;
const CANVAS_H = 560;

type Stroke = { type: string; x1?: number; y1?: number; x2?: number; y2?: number; color?: string; size?: number; stroke?: number };

export default function SkribblGame() {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";

  const [gameState, setGameState] = useState<any>(null);
  const [guessInput, setGuessInput] = useState("");
  const [drawColor, setDrawColor] = useState("#000000");
  const [drawSize, setDrawSize] = useState(7);
  const [erasing, setErasing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const strokeIdRef = useRef(1);
  const msgEndRef = useRef<HTMLDivElement | null>(null);
  const chatLenRef = useRef(0);

  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(SKRIBBL, lang);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Reserve the site header's height so it sits above the board, not over it.
  useGameChrome();

  // --- canvas painting -----------------------------------------------------
  const paint = useCallback((data: Stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (data.type === "clear") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (data.type !== "line") return;

    ctx.beginPath();
    ctx.strokeStyle = data.color || "#000";
    ctx.lineWidth = data.size || 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo((data.x1 || 0) * canvas.width, (data.y1 || 0) * canvas.height);
    ctx.lineTo((data.x2 || 0) * canvas.width, (data.y2 || 0) * canvas.height);
    ctx.stroke();
  }, []);

  const replay = useCallback((strokes: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    (strokes || []).forEach(paint);
  }, [paint]);

  // --- socket --------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;
    const onState = (state: any) => setGameState(state);
    const onDraw = (data: Stroke) => paint(data);
    const onRedraw = (strokes: Stroke[]) => replay(strokes);

    socket.on("skribbl_state", onState);
    socket.on("skribbl_draw", onDraw);
    socket.on("skribbl_redraw", onRedraw);
    return () => {
      socket.off("skribbl_state", onState);
      socket.off("skribbl_draw", onDraw);
      socket.off("skribbl_redraw", onRedraw);
    };
  }, [socket, paint, replay]);

  // Repaint the board whenever the turn changes (also covers a fresh join).
  const phase = gameState?.phase;
  const drawerId = gameState?.currentDrawer;
  useEffect(() => {
    replay(gameState?.drawingData ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, drawerId]);

  // --- names ---------------------------------------------------------------
  const playerIds: string[] = gameState?.players ?? [];
  const names = usePlayerNames(playerIds);
  const nameOf = useCallback(
    (id: string) => displayNameFor(id, names),
    [names]
  );

  // --- sound ---------------------------------------------------------------
  useGameEvents(gameState?.events, (e: GameEvent) => {
    switch (e.type) {
      case "turn_start": sound.play("roundStart"); break;
      case "word_chosen": sound.play("click"); break;
      case "correct": sound.play("correct"); break;
      case "close": sound.play("close"); break;
      case "hint": sound.play("hint"); break;
      case "hurry": sound.play("timeUp"); break;
      case "turn_end": sound.play("roundEnd"); break;
      case "game_over": sound.play("win"); break;
    }
  });

  // A soft pop for ordinary chatter.
  const chatCount = gameState?.chatMessages?.length ?? 0;
  useEffect(() => {
    if (chatCount > chatLenRef.current && chatLenRef.current > 0) {
      const last = gameState?.chatMessages?.[chatCount - 1];
      if (last?.type === "normal") sound.play("chat");
    }
    chatLenRef.current = chatCount;
  }, [chatCount, gameState?.chatMessages]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chatCount]);

  // --- drawing input -------------------------------------------------------
  const canDraw = !!gameState?.isDrawer && gameState?.phase === "DRAWING";

  const posFrom = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    strokeIdRef.current += 1;
    const pos = posFrom(e);
    lastPosRef.current = pos;
    // A tap should leave a dot, not nothing.
    emitStroke(pos, pos);
  };

  const emitStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const data: Stroke = {
      type: "line",
      x1: from.x, y1: from.y, x2: to.x, y2: to.y,
      color: erasing ? "#ffffff" : drawColor,
      size: erasing ? drawSize * 2.2 : drawSize,
      stroke: strokeIdRef.current,
    };
    paint(data);
    socket?.emit("skribbl_draw_data", data);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !lastPosRef.current) return;
    const pos = posFrom(e);
    emitStroke(lastPosRef.current, pos);
    lastPosRef.current = pos;
  };

  const onPointerUp = () => { drawingRef.current = false; lastPosRef.current = null; };

  const clearCanvas = () => {
    sound.play("click");
    socket?.emit("skribbl_clear");
    replay([]);
  };
  const undo = () => { sound.play("click"); socket?.emit("skribbl_undo"); };

  const submitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const text = guessInput.trim();
    if (!text) return;
    socket?.emit("skribbl_guess", { text });
    setGuessInput("");
  };

  const chooseWord = (idx: number) => { sound.play("click"); socket?.emit("skribbl_choose_word", { wordIndex: idx }); };
  const nextTurn = () => { sound.play("click"); socket?.emit("skribbl_next_turn"); };
  const returnLobby = () => socket?.emit("lobby_return");
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/games"; };

  const ranked = useMemo(() => {
    const scores = gameState?.scores ?? {};
    return [...playerIds].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.scores, playerIds.join(",")]);

  if (!gameState || gameState.status === "WAITING") return null;

  const isDrawer = !!gameState.isDrawer;
  const drawerName = gameState.currentDrawer === mySteamId ? t("youLabel") : nameOf(gameState.currentDrawer);
  const isHost = gameState.host === mySteamId;
  const finished = gameState.status === "FINISHED";
  const timeRatio = Math.max(0, Math.min(1, (gameState.timeLeft ?? 0) / 80));
  const revealed = gameState.word || gameState.revealedWord;
  const guessedSet: string[] = gameState.guessed ?? [];

  return createPortal(
    <div className="skribbl-root">
      {/* ------------------------------------------------------------ topbar */}
      <header className="skr-topbar">
        <div className="skr-round-block">
          <span className="skr-round">
            <b className="skr-brand">FREE-DRAW</b>
            {t("round", { n: (gameState.round ?? 0) + 1, m: gameState.maxRounds })}
          </span>
          <span className="skr-drawer">
            {isDrawer ? t("youAreDrawing") : t("isDrawing", { name: drawerName })}
          </span>
        </div>

        <div className="skr-word-block">
          {gameState.phase === "DRAWING" || gameState.phase === "ROUND_END" ? (
            <WordSlots text={revealed ?? gameState.hint ?? ""} masked={!revealed} hint={gameState.hint ?? ""} />
          ) : (
            <span className="skr-word-waiting">{t("isChoosing", { name: drawerName })}</span>
          )}
        </div>

        <div className="skr-top-right">
          <div className={`skr-timer ${gameState.timeLeft <= 15 ? "warning" : ""}`}>
            <svg viewBox="0 0 40 40" className="skr-timer-ring">
              <circle cx="20" cy="20" r="17" className="ring-bg" />
              <motion.circle
                cx="20" cy="20" r="17"
                className="ring-fg"
                transform="rotate(-90 20 20)"
                initial={false}
                animate={{ pathLength: timeRatio }}
                transition={{ duration: 0.9, ease: "linear" }}
              />
            </svg>
            <span>{Math.max(0, gameState.timeLeft ?? 0)}</span>
          </div>
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
          <button className="skr-icon-btn" onClick={exitGame} title={t("leaveGame")} aria-label={t("leaveGame")}>✕</button>
        </div>
      </header>

      {/* ------------------------------------------------------------- stage */}
      <div className="skr-stage">
        <div className="skr-canvas-col">
          <div className="skr-canvas-wrapper">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className={canDraw ? "drawable" : ""}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerUp}
            />

            {/* word choice */}
            <AnimatePresence>
              {gameState.phase === "CHOOSING" && (
                <motion.div
                  className="skr-overlay"
                  key="choosing"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {isDrawer ? (
                    <>
                      <h3>{t("chooseWord")}</h3>
                      <div className="skr-word-choices">
                        {(gameState.wordChoices ?? []).map((w: string, i: number) => (
                          <motion.button
                            key={w}
                            className="skr-word-choice"
                            onClick={() => chooseWord(i)}
                            initial={{ opacity: 0, y: 24, rotate: (i - 1) * 4 }}
                            animate={{ opacity: 1, y: 0, rotate: (i - 1) * 2 }}
                            transition={{ delay: i * 0.08, type: "spring", stiffness: 260, damping: 20 }}
                            whileHover={{ y: -6, rotate: 0, scale: 1.05 }}
                          >
                            {w}
                          </motion.button>
                        ))}
                      </div>
                      <span className="skr-overlay-sub">{t("autoPick", { n: Math.max(0, gameState.chooseIn ?? 0) })}</span>
                    </>
                  ) : (
                    <>
                      <motion.div
                        className="skr-pencil"
                        animate={{ rotate: [-12, 12, -12] }}
                        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                      >✏️</motion.div>
                      <h3>{t("isChoosing", { name: drawerName })}</h3>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* end of turn */}
            <AnimatePresence>
              {gameState.phase === "ROUND_END" && (
                <motion.div
                  className="skr-overlay"
                  key="roundend"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {finished ? (
                    <>
                      <h3>{t("gameOver")}</h3>
                      <motion.div
                        className="skr-winner"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 240, damping: 18 }}
                      >
                        🏆 {t("winner", { name: nameOf(ranked[0]), n: gameState.scores?.[ranked[0]] ?? 0 })}
                      </motion.div>
                      <div className="skr-final-list">
                        {ranked.map((pid, i) => (
                          <div key={pid} className="skr-final-row">
                            <span>{i + 1}. {pid === mySteamId ? t("youLabel") : nameOf(pid)}</span>
                            <span>{gameState.scores?.[pid] ?? 0} {t("points")}</span>
                          </div>
                        ))}
                      </div>
                      <button className="skr-primary" onClick={isHost ? returnLobby : exitGame}>
                        {isHost ? t("returnLobby") : t("leaveGame")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="skr-overlay-sub">{t("theWordWas")}</span>
                      <motion.div
                        className="skr-revealed-word"
                        initial={{ scale: 0.7, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 250, damping: 18 }}
                      >
                        {gameState.revealedWord}
                      </motion.div>
                      <div className="skr-turn-scores">
                        {Object.entries<any>(gameState.turnScores ?? {})
                          .sort((a, b) => b[1] - a[1])
                          .map(([pid, pts], i) => (
                            <motion.div
                              key={pid}
                              className="skr-turn-score"
                              initial={{ opacity: 0, x: -14 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.15 + i * 0.07 }}
                            >
                              <span>{pid === mySteamId ? t("youLabel") : nameOf(pid)}</span>
                              <span className="pts">+{pts}</span>
                            </motion.div>
                          ))}
                      </div>
                      <span className="skr-overlay-sub">{t("nextIn", { n: Math.max(0, gameState.roundEndIn ?? 0) })}</span>
                      {isHost && (
                        <button className="skr-primary small" onClick={nextTurn}>{t("nextTurn")} ▸</button>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* toolbar */}
          <AnimatePresence>
            {canDraw && (
              <motion.div
                className="skr-tools"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 14 }}
              >
                <div className="skr-swatches">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`skr-color-btn ${!erasing && drawColor === c ? "active" : ""}`}
                      style={{ background: c }}
                      onClick={() => { setDrawColor(c); setErasing(false); }}
                      aria-label={c}
                    />
                  ))}
                </div>
                <div className="skr-tool-divider" />
                {SIZES.map((s) => (
                  <button
                    key={s}
                    className={`skr-size-btn ${drawSize === s ? "active" : ""}`}
                    onClick={() => setDrawSize(s)}
                    title={`${s}px`}
                  >
                    <span style={{ width: Math.min(20, s), height: Math.min(20, s) }} />
                  </button>
                ))}
                <div className="skr-tool-divider" />
                <button className={`skr-tool-btn ${erasing ? "active" : ""}`} onClick={() => setErasing((v) => !v)}>
                  🧽 {t("eraser")}
                </button>
                <button className="skr-tool-btn" onClick={undo}>↶ {t("undo")}</button>
                <button className="skr-tool-btn danger" onClick={clearCanvas}>🗑 {t("clear")}</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ------------------------------------------------------------ side */}
        <aside className="skr-side">
          <div className="skr-scoreboard">
            {ranked.map((pid, i) => {
              const isTurn = pid === gameState.currentDrawer;
              const hasGuessed = guessedSet.includes(pid);
              return (
                <motion.div
                  key={pid}
                  layout
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  className={`skr-score-row ${isTurn ? "drawing" : ""} ${hasGuessed ? "guessed" : ""} ${pid === mySteamId ? "me" : ""}`}
                >
                  <span className="rank">{i + 1}</span>
                  <span className="who">
                    {isTurn ? "✏️ " : hasGuessed ? "✅ " : ""}
                    {pid === mySteamId ? t("youLabel") : nameOf(pid)}
                  </span>
                  <motion.span
                    key={gameState.scores?.[pid]}
                    className="score-pts"
                    initial={{ scale: 1.45, color: "#4ade80" }}
                    animate={{ scale: 1, color: "#c4b5fd" }}
                    transition={{ duration: 0.35 }}
                  >
                    {gameState.scores?.[pid] ?? 0}
                  </motion.span>
                </motion.div>
              );
            })}
          </div>

          <div className="skr-messages">
            <AnimatePresence initial={false}>
              {(gameState.chatMessages ?? []).map((msg: any, i: number) => {
                const who = msg.pid === mySteamId ? t("youLabel") : nameOf(msg.pid);
                return (
                  <motion.div
                    key={`${msg.at}-${msg.pid}`}
                    className={`skr-msg ${msg.type}`}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {msg.type === "correct" ? (
                      <span>
                        ✅ {msg.pid === mySteamId
                          ? t("youGuessed", { n: msg.points })
                          : t("guessedIt", { name: who })}
                      </span>
                    ) : msg.type === "close" ? (
                      <span><b>{who}:</b> {msg.text} <em>({t("closeGuess")})</em></span>
                    ) : (
                      <span><b>{who}:</b> {msg.text}</span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={msgEndRef} />
          </div>

          {!isDrawer && gameState.phase === "DRAWING" && !gameState.hasGuessed ? (
            <form className="skr-chat-input" onSubmit={submitGuess}>
              <input
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                placeholder={t("guessPlaceholder")}
                maxLength={60}
                autoFocus
              />
              <button type="submit" aria-label="send">➤</button>
            </form>
          ) : (
            <div className="skr-chat-locked">
              {isDrawer ? t("youAreDrawing") : gameState.hasGuessed ? `✅ ${t("guessed")}` : t("waitingToStart")}
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body
  );
}

/** The word, one boxed letter per character; revealed letters flip in. */
function WordSlots({ text, masked, hint }: { text: string; masked: boolean; hint: string }) {
  const source = masked ? hint : text;
  return (
    <div className="skr-word-slots" title={masked ? undefined : text}>
      {source.split("").map((ch, i) => {
        const blank = ch === "_";
        const space = ch === " ";
        if (space) return <span key={i} className="slot space" />;
        return (
          <motion.span
            key={`${i}-${ch}`}
            className={`slot ${blank ? "blank" : "filled"}`}
            initial={blank ? false : { rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ duration: 0.32 }}
          >
            {blank ? "" : ch}
          </motion.span>
        );
      })}
    </div>
  );
}
