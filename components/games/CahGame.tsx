"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import { useGameLang, translator, LangToggle, PILEOF } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import "./shared.css";
import { useI18n } from '@/components/I18nProvider';
import "./cah.css";

type Card = { id: number | string; text: string; custom?: boolean };
type Sub = { playerId: string; cards: Card[] };

// Render the prompt with its blanks filled by the answer cards (bolded), or —
// for question-style prompts — the answers on their own.
function FilledPrompt({ black, cards }: { black: string; cards: Card[] }) {
  if (!black.includes("_____")) {
    return (
      <span>
        {black} <b className="fill">{cards.map((c) => stripDot(c.text)).join(" / ")}</b>
      </span>
    );
  }
  const parts = black.split("_____");
  return (
    <span>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && <b className="fill">{cards[i] ? stripDot(cards[i].text) : "________"}</b>}
        </React.Fragment>
      ))}
    </span>
  );
}
const stripDot = (t: string) => t.replace(/\.$/, "");

export default function CahGame() {
    const { t } = useI18n();

  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";

  const [gameState, setGameState] = useState<any>(null);
  const [selected, setSelected] = useState<(number | string)[]>([]);
  const [customTexts, setCustomTexts] = useState<string[]>([]);
  const [customMode, setCustomMode] = useState(false);

  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(PILEOF, lang);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useGameChrome();

  useEffect(() => {
    if (!socket) return;
    const onState = (s: any) => setGameState(s);
    socket.on("cah_state", onState);
    return () => { socket.off("cah_state", onState); };
  }, [socket]);

  const round = gameState?.round;
  const phase = gameState?.phase;
  const pick = gameState?.pick ?? 1;
  useEffect(() => {
    if (phase === "SUBMIT") {
      setSelected([]);
      setCustomTexts(new Array(pick).fill(""));
      setCustomMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase]);

  const playerIds: string[] = gameState?.players ?? [];
  const names = usePlayerNames(playerIds);
  const nameOf = useCallback(
    (id: string) => (id === mySteamId ? t("youLabel") : displayNameFor(id, names)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, mySteamId, lang]
  );

  useGameEvents(gameState?.events, (e: GameEvent) => {
    switch (e.type) {
      case "round_start": sound.play("cardDeal"); break;
      case "submitted": if (e.pid !== mySteamId) sound.play("submit"); break;
      case "judging": sound.play("whoosh"); break;
      case "winner": sound.play("fanfare"); break;
      case "game_over": sound.play("fanfare"); break;
    }
  });

  const ranked = useMemo(() => {
    const scores = gameState?.scores ?? {};
    return [...playerIds].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.scores, playerIds.join(",")]);

  if (!gameState || gameState.status === "WAITING") return null;

  const isCzar = gameState.czar === mySteamId;
  const isHost = gameState.host === mySteamId;
  const finished = gameState.status === "FINISHED";
  const black: Card | null = gameState.currentBlack;
  const hand: Card[] = gameState.hand ?? [];
  const subs: Sub[] = gameState.revealedSubmissions ?? [];

  const toggleCard = (id: number | string) => {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < pick) { sound.play("cardPlay"); setSelected([...selected, id]); }
  };
  const submitCards = () => { sound.play("submit"); socket?.emit("cah_submit", { cardIds: selected }); };
  const submitCustom = () => { sound.play("submit"); socket?.emit("cah_submit_custom", { customTexts }); };
  const pickWinner = (pid: string) => { sound.play("voteCast"); socket?.emit("cah_pick_winner", { winnerPlayerId: pid }); };
  const nextRound = () => { sound.play("click"); socket?.emit("cah_next_round"); };
  const returnLobby = () => socket?.emit("lobby_return");
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/games"; };

  const phaseLabel = phase === "SUBMIT" ? t("phaseSubmit") : phase === "JUDGE" ? t("phaseJudge") : t("phaseReveal");
  const submittedCount = gameState.submittedPlayers?.length ?? 0;
  const total = Math.max(0, playerIds.length - 1);
  const timerTotal = gameState.options?.timer || 60;
  const timeRatio = gameState.timeLeft == null ? 0 : Math.max(0, Math.min(1, gameState.timeLeft / timerTotal));

  return createPortal(
    <div className="pileof-root">
      {/* ---------------------------------------------------------- top bar */}
      <header className="pile-topbar">
        <div className="pile-brand-block">
          <span className="pile-brand">{t("auto.cahgame.pile_of")}<span className="pile-brand-dots">...</span></span>
          <span className="pile-round">{t("round", { n: gameState.round, m: gameState.maxRounds })}</span>
        </div>
        <div className="pile-phase-pill">{phaseLabel}</div>
        <div className="pile-top-right">
          {gameState.timeLeft != null && phase !== "REVEAL" && (
            <div className={`pile-timer ${gameState.timeLeft <= 10 ? "warning" : ""}`}>{Math.max(0, gameState.timeLeft)}</div>
          )}
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
          <button className="pile-icon-btn" onClick={exitGame} title={t("leaveGame")} aria-label={t("leaveGame")}>✕</button>
        </div>
      </header>
      {gameState.timeLeft != null && phase !== "REVEAL" && (
        <div className="pile-timebar"><span style={{ transform: `scaleX(${timeRatio})` }} /></div>
      )}

      <div className="pile-stage">
        {finished ? (
          <FinalBoard ranked={ranked} scores={gameState.scores} history={gameState.history} nameOf={nameOf} mySteamId={mySteamId} t={t} isHost={isHost} onReturn={returnLobby} onLeave={exitGame} />
        ) : (
          <>
            {/* black prompt */}
            {black && (
              <motion.div
                key={black.id}
                className="pile-black-card"
                initial={{ opacity: 0, rotate: -3, y: 20 }}
                animate={{ opacity: 1, rotate: -1.5, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 20 }}
              >
                <span className="pile-black-text">{black.text.replace(/_____/g, "________")}</span>
                {pick > 1 && <span className="pile-pick-badge">{t("pickText", { n: pick })}</span>}
                <span className="pile-czar-tag">👑 {isCzar ? t("youLabel") : nameOf(gameState.czar)}</span>
              </motion.div>
            )}

            {/* ---- SUBMIT ---- */}
            {phase === "SUBMIT" && (
              isCzar ? (
                <div className="pile-wait">{t("youAreCzar")}<span className="pile-wait-count">{t("waitingCount", { n: submittedCount, m: total })}</span></div>
              ) : gameState.hasSubmitted ? (
                <div className="pile-wait"><motion.div className="pile-spinner" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }} />{t("submittedWait")}<span className="pile-wait-count">{t("waitingCount", { n: submittedCount, m: total })}</span></div>
              ) : customMode ? (
                <div className="pile-custom">
                  <div className="pile-custom-fields">
                    {customTexts.map((c, i) => (
                      <input
                        key={i}
                        className="pile-input"
                        value={c}
                        maxLength={120}
                        placeholder={t("customCard", { n: i + 1 })}
                        onChange={(e) => { const n = [...customTexts]; n[i] = e.target.value; setCustomTexts(n); }}
                      />
                    ))}
                  </div>
                  <div className="pile-custom-actions">
                    <button className="pile-ghost" onClick={() => setCustomMode(false)}>← {t("backToHand")}</button>
                    <button className="pile-primary" onClick={submitCustom} disabled={customTexts.some((x) => !x.trim())}>{t("submitCustom")} ✓</button>
                  </div>
                  <span className="pile-custom-hint">{t("customHint")}</span>
                </div>
              ) : (
                <>
                  <div className="pile-hand">
                    <AnimatePresence initial={false}>
                      {hand.map((card, i) => {
                        const idx = selected.indexOf(card.id);
                        return (
                          <motion.button
                            key={card.id}
                            layout
                            className={`pile-white-card ${idx >= 0 ? "selected" : ""}`}
                            onClick={() => toggleCard(card.id)}
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ delay: Math.min(0.3, i * 0.03) }}
                            whileHover={{ y: -6 }}
                          >
                            {card.text}
                            {idx >= 0 && pick > 1 && <span className="pile-pick-num">{idx + 1}</span>}
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                  <div className="pile-submit-bar">
                    <button className="pile-primary" onClick={submitCards} disabled={selected.length !== pick}>
                      {t("submit")} ({selected.length}/{pick})
                    </button>
                    {gameState.allowCustom && (
                      <button className="pile-ghost" onClick={() => setCustomMode(true)}>✎ {t("writeCustom")}</button>
                    )}
                  </div>
                </>
              )
            )}

            {/* ---- JUDGE / REVEAL ---- */}
            {(phase === "JUDGE" || phase === "REVEAL") && (
              <>
                <div className="pile-judge-head">
                  {phase === "JUDGE" ? (isCzar ? t("tapToPick") : t("czarPicks")) : (gameState.roundWinner && t("roundWinner", { name: nameOf(gameState.roundWinner) }))}
                </div>
                <div className="pile-answers">
                  {subs.map((sub, i) => {
                    const isWinner = gameState.roundWinner === sub.playerId;
                    const canPick = isCzar && phase === "JUDGE";
                    return (
                      <motion.button
                        key={i}
                        className={`pile-answer ${isWinner ? "winner" : ""} ${canPick ? "pickable" : ""}`}
                        disabled={!canPick}
                        onClick={() => canPick && pickWinner(sub.playerId)}
                        initial={{ opacity: 0, y: 20, rotate: (i % 2 ? 1 : -1) * 2 }}
                        animate={{ opacity: 1, y: 0, rotate: 0 }}
                        transition={{ delay: i * 0.08, type: "spring", stiffness: 240, damping: 22 }}
                        whileHover={canPick ? { y: -5, scale: 1.02 } : undefined}
                      >
                        {black && <span className="pile-answer-text"><FilledPrompt black={black.text} cards={sub.cards} /></span>}
                        {phase === "REVEAL" && <span className="pile-answer-author">{isWinner ? "🏆 " : ""}{nameOf(sub.playerId)}</span>}
                      </motion.button>
                    );
                  })}
                </div>
                {phase === "REVEAL" && (
                  <div className="pile-reveal-foot">
                    {isHost ? <button className="pile-primary" onClick={nextRound}>{t("nextRound")} ▸</button>
                      : <span className="pile-next-hint">{t("nextIn", { n: Math.max(0, gameState.revealIn ?? 0) })}</span>}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------- scoreboard */}
      <footer className="pile-scorebar">
        {ranked.map((pid) => {
          const isC = gameState.czar === pid;
          const acted = phase === "SUBMIT" && gameState.submittedPlayers?.includes(pid);
          return (
            <motion.div key={pid} layout className={`pile-score-chip ${pid === mySteamId ? "me" : ""} ${isC ? "czar" : ""} ${acted ? "acted" : ""}`}>
              {isC && <span className="pile-crown">👑</span>}
              <span className="pile-score-name">{pid === mySteamId ? t("youLabel") : nameOf(pid)}</span>
              <motion.span key={gameState.scores?.[pid]} className="pile-score-val" initial={{ scale: 1.5, color: "#fde047" }} animate={{ scale: 1, color: "#e5e5ea" }} transition={{ duration: 0.4 }}>
                {gameState.scores?.[pid] ?? 0}
              </motion.span>
              {acted && <span className="pile-score-tick">✓</span>}
            </motion.div>
          );
        })}
      </footer>
    </div>,
    document.body
  );
}

function FinalBoard({ ranked, scores, history, nameOf, mySteamId, t, isHost, onReturn, onLeave }: {
  ranked: string[]; scores: Record<string, number>; history: any[];
  nameOf: (id: string) => string; mySteamId: string; t: (k: any, p?: any) => string;
  isHost: boolean; onReturn: () => void; onLeave: () => void;
}) {
  return (
    <motion.div className="pile-final" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      <h1 className="pile-final-title">{t("gameOver")}</h1>
      {ranked[0] && (
        <motion.div className="pile-final-winner" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.15 }}>
          🏆 {t("winner", { name: ranked[0] === mySteamId ? t("youLabel") : nameOf(ranked[0]) })}
        </motion.div>
      )}
      <div className="pile-final-list">
        {ranked.map((pid, i) => (
          <motion.div key={pid} className="pile-final-row" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07 }}>
            <span>{i + 1}. {pid === mySteamId ? t("youLabel") : nameOf(pid)}</span>
            <span className="pts">{scores[pid] ?? 0} {t("points")}</span>
          </motion.div>
        ))}
      </div>
      {history?.length > 0 && (
        <div className="pile-recap">
          <div className="pile-recap-title">{t("recap")}</div>
          <div className="pile-recap-list">
            {history.slice(-6).reverse().map((h: any, i: number) => (
              <div key={i} className="pile-recap-item">
                <FilledPrompt black={h.blackCard} cards={h.whiteCards.map((w: string) => ({ id: w, text: w }))} />
                <span className="pile-recap-winner">— {nameOf(h.winner)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {isHost ? <button className="pile-primary" onClick={onReturn}>{t("returnLobby")}</button>
        : <button className="pile-primary" onClick={onLeave}>{t("leaveGame")}</button>}
    </motion.div>
  );
}
