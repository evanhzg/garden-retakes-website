"use client";

// The lobby race screen for the quizzes.
//
// Everyone answers the same paper independently and the first to the target
// number of correct answers wins. The server holds the answer key, so this
// screen shows no feedback beyond "your score went up" — it just posts the
// choice and renders the next question the server sends back.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { useGameLang, translator, LangToggle, QUIZ } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import type { QuizTheme, QuizChoice } from "@/components/games/quiz/QuizPage";
import "@/components/games/shared.css";
import "@/components/games/quiz/quiz.css";

type Rival = { steamId: string; isBot: boolean; botName?: string | null; score: number; asked: number; done: boolean };

export default function QuizRaceScreen({ theme }: { theme: QuizTheme }) {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";

  const [gameState, setGameState] = useState<any>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(QUIZ, lang);
  const g = translator(theme.dict, lang);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useGameChrome();

  useEffect(() => {
    if (!socket) return;
    const onState = (s: any) => { setGameState(s); setPending(null); };
    socket.on("quiz_state", onState);
    return () => { socket.off("quiz_state", onState); };
  }, [socket]);

  const rivals: Rival[] = gameState?.rivals ?? [];
  const ids = useMemo(
    () => [mySteamId, ...rivals.map((r) => r.steamId)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mySteamId, rivals.map((r) => r.steamId).join(",")]
  );
  const names = usePlayerNames(ids);
  const nameOf = useCallback(
    (id: string) => {
      if (id === mySteamId) return t("raceYou");
      const r = rivals.find((x) => x.steamId === id);
      return displayNameFor(id, names, r ? { isBot: r.isBot, botName: r.botName ?? undefined } : undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, mySteamId, rivals, lang]
  );

  useGameEvents(gameState?.events, (e: GameEvent) => {
    switch (e.type) {
      case "start": sound.play("roundStart"); break;
      case "scored": sound.play(e.pid === mySteamId ? "correct" : "chat"); break;
      case "missed": if (e.pid === mySteamId) sound.play("error"); break;
      case "timeout": sound.play("timeUp"); break;
      case "win": sound.play("fanfare"); break;
    }
  });

  const submit = useCallback((choiceId: string) => {
    if (pending || !gameState?.question) return;
    setPending(choiceId);
    socket?.emit("quiz_answer", { questionId: gameState.question.id, choice: choiceId });
  }, [socket, pending, gameState]);

  if (!gameState || gameState.status === "WAITING") return null;

  const me = gameState.me;
  const finished = gameState.status === "FINISHED";
  const target = gameState.targetScore ?? 7;
  const q = gameState.question;
  const isHost = gameState.host === mySteamId;
  const iWon = gameState.winner === mySteamId;

  const returnLobby = () => socket?.emit("lobby_return");
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/games"; };

  // Prompt params can themselves be dictionary keys (a stat name, a team).
  const params = { ...(q?.prompt?.params || {}) };
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && /^(stat|team)[A-Z]/.test(v)) params[k] = g(v as any);
    else if (typeof v === "string" && theme.term) params[k] = theme.term(v, lang);
  }

  const labelFor = (c: QuizChoice) => {
    if (!c.term) return c.label;
    const viaDict = g(c.label as any);
    if (viaDict !== c.label) return viaDict;
    return theme.term ? theme.term(c.label, lang) : c.label;
  };

  return createPortal(
    <div className={`quiz-race ${theme.rootClass}`}>
      <header className="quiz-race-topbar">
        <div className="quiz-race-brand">
          <h1 className="quiz-brand">{g("brand")}</h1>
          <span className="quiz-race-sub">
            {t("raceTitle", { n: target })} · {g(`tier${gameState.tier}` as any)}
          </span>
        </div>

        <div className="quiz-race-score">
          <span>🎯</span>
          <span>{me?.score ?? 0}/{target}</span>
        </div>

        <div className="quiz-race-right">
          {gameState.timeLeft != null && !finished && (
            <div className={`quiz-race-timer ${gameState.timeLeft <= 5 ? "warning" : ""}`}>{Math.max(0, gameState.timeLeft)}</div>
          )}
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
          <button className="quiz-icon-btn" onClick={exitGame} title={t("leaveGame")} aria-label={t("leaveGame")}>✕</button>
        </div>
      </header>

      <div className="quiz-race-stage">
        <div className="quiz-race-board">
          {finished || me?.done ? (
            <div className="quiz-loading">{t("waitingOthers")}</div>
          ) : q ? (
            <motion.div
              key={q.id}
              className="quiz-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
            >
              <div className="quiz-prompt-row">
                {theme.renderImage?.({ image: q.image, champion: q.champion }, "lg")}
                <h2 className="quiz-prompt">{g(q.prompt.key, params)}</h2>
              </div>
              {q.type === "input" ? (
                <form
                  className="quiz-input-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = new FormData(e.currentTarget).get("ans") as string;
                    if (val && !pending) submit(val.trim());
                  }}
                >
                  <input
                    name="ans"
                    type="text"
                    className="quiz-text-input"
                    disabled={!!pending}
                    autoFocus
                    autoComplete="off"
                    placeholder={t("inputPlaceholder" as any) || "Type your answer..."}
                  />
                  <button type="submit" disabled={!!pending} className="quiz-primary" style={{ marginTop: "12px", width: "100%" }}>
                    {t("submit" as any)}
                  </button>
                </form>
              ) : (
                <div className={`quiz-choices ${q.choices?.length === 3 ? "three" : ""}`}>
                  {(q.choices || []).map((c: QuizChoice, i: number) => (
                    <motion.button
                      key={c.id}
                      className={`quiz-choice ${pending === c.id ? "pending" : ""}`}
                      disabled={!!pending}
                      onClick={() => submit(c.id)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileHover={!pending ? { y: -2 } : undefined}
                    >
                      {theme.renderImage?.({ image: c.image, champion: c.champion }, "sm")}
                      <span className="quiz-choice-label">{labelFor(c)}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : null}

          {me?.history?.length > 0 && (
            <div className="quiz-result-grid race">
              {me.history.map((ok: boolean, i: number) => <span key={i} className={ok ? "ok" : "no"} />)}
            </div>
          )}
        </div>

        <aside className="quiz-rivals">
          <span className="quiz-rivals-title">{t("raceRivals")}</span>
          <RivalCard name={t("raceYou")} score={me?.score ?? 0} target={target} asked={me?.asked ?? 0} done={!!me?.done} mine />
          {rivals.map((r) => (
            <RivalCard key={r.steamId} name={nameOf(r.steamId)} score={r.score} target={target} asked={r.asked} done={r.done} />
          ))}
        </aside>
      </div>

      <AnimatePresence>
        {finished && (
          <motion.div className="quiz-race-final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="quiz-result"
              initial={{ scale: 0.88, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
            >
              <span className="quiz-result-score">
                {iWon ? t("raceWon") : t("raceLost", { name: nameOf(gameState.winner) })}
              </span>
              <span className="quiz-rivals-title">{t("raceStandings")}</span>
              <div className="quiz-standings">
                {(gameState.standings ?? []).map((s: any, i: number) => (
                  <motion.div
                    key={s.steamId}
                    className={`quiz-standing ${s.steamId === mySteamId ? "me" : ""}`}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + i * 0.06 }}
                  >
                    <span>{i + 1}. {nameOf(s.steamId)}</span>
                    <span className="pts">{s.score}/{target} · {s.asked}</span>
                  </motion.div>
                ))}
              </div>
              <div className="quiz-result-actions">
                {isHost
                  ? <button className="quiz-primary" onClick={returnLobby}>{t("returnLobby")}</button>
                  : <button className="quiz-primary" onClick={exitGame}>{t("leaveGame")}</button>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

function RivalCard({ name, score, target, asked, done, mine }: {
  name: string; score: number; target: number; asked: number; done?: boolean; mine?: boolean;
}) {
  return (
    <div className={`quiz-rival ${mine ? "me" : ""} ${done ? "done" : ""}`}>
      <div className="quiz-rival-top">
        <span className="quiz-rival-name">{done ? "🏁 " : ""}{name}</span>
        <span className="quiz-rival-score">{score}/{target}</span>
      </div>
      <div className="quiz-rival-bar">
        <motion.span animate={{ scaleX: Math.max(0.02, score / Math.max(1, target)) }} transition={{ type: "spring", stiffness: 260, damping: 26 }} />
      </div>
      <span className="quiz-rival-sub">{asked} answered</span>
    </div>
  );
}
