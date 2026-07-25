"use client";

// HEADSHOT — race mode, played from the universal lobby.
//
// Everyone works through the same run of pros independently; the server owns
// the answers and scores every guess, so this component only ever knows its own
// board. Rivals show up as a score and a guess count on the rail.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { useGameLang, translator, LangToggle, HEADSHOT } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import { useHeadshotPool } from "@/components/games/headshot/useHeadshotPool";
import { SearchBox, GuessGrid, Legend, flagOf, type GuessRow } from "@/components/games/headshot/GuessBoard";
import type { HeadshotPlayer } from "@/scripts/headshotRules";
import "./shared.css";
import "./headshot/headshot.css";

type Rival = { steamId: string; isBot: boolean; botName?: string | null; score: number; guesses: number; done: boolean };

export default function HeadshotGame() {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";
  const { pool } = useHeadshotPool();

  const [gameState, setGameState] = useState<any>(null);
  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(HEADSHOT, lang);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useGameChrome();

  useEffect(() => {
    if (!socket) return;
    const onState = (s: any) => setGameState(s);
    socket.on("headshot_state", onState);
    return () => { socket.off("headshot_state", onState); };
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
      case "solved": sound.play(e.pid === mySteamId ? "correct" : "chat"); break;
      case "revealed": if (e.pid === mySteamId) sound.play("close"); break;
      case "timeout": sound.play("timeUp"); break;
      case "win": sound.play("fanfare"); break;
    }
  });

  const submit = useCallback((p: HeadshotPlayer) => {
    sound.play("click");
    socket?.emit("headshot_guess", { player: p.id });
  }, [socket]);

  if (!gameState || gameState.status === "WAITING") return null;

  const me = gameState.me;
  const finished = gameState.status === "FINISHED";
  const target = gameState.targetScore ?? 5;
  const guessedIds: string[] = (me?.guesses ?? []).map((g: any) => g.id);

  // The server already scored every guess — just pair each one with its player.
  const rows: GuessRow[] = pool
    ? (me?.guesses ?? [])
      .map((g: any) => {
        const player = pool.byId.get(g.id);
        return player ? { player, result: g.result } : null;
      })
      .filter(Boolean)
      .reverse()
    : [];

  const isHost = gameState.host === mySteamId;
  const returnLobby = () => socket?.emit("lobby_return");
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/games"; };

  const standings = gameState.standings ?? [];
  const iWon = gameState.winner === mySteamId;

  return createPortal(
    <div className="hs-race">
      <header className="hs-race-topbar">
        <div className="hs-race-brand">
          <h1 className="hs-brand">{t("brand")}</h1>
          <span className="hs-race-sub">{t("raceTitle", { n: target })}</span>
        </div>

        <div className="hs-race-score">
          <span>🎯</span>
          <span>{t("raceScore", { n: me?.score ?? 0, m: target })}</span>
        </div>

        <div className="hs-race-right">
          {gameState.timeLeft != null && !finished && (
            <div className={`hs-race-timer ${gameState.timeLeft <= 10 ? "warning" : ""}`}>{Math.max(0, gameState.timeLeft)}</div>
          )}
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
          <button className="hs-icon-btn" onClick={exitGame} title={t("leaveGame")} aria-label={t("leaveGame")}>✕</button>
        </div>
      </header>

      <div className="hs-race-stage">
        <div className="hs-race-board">
          {!pool ? (
            <div className="hs-loading"><span className="hs-spinner" />{t("loading")}</div>
          ) : finished || me?.done ? (
            // Reaching the target ends the race, so the final overlay is already
            // on top of this — the board just stops taking input.
            null
          ) : (
            <>
              <SearchBox pool={pool.players} exclude={guessedIds} lang={lang} onPick={submit} autoFocus />
              <span className="hs-guess-count">
                {t("raceRevealIn", { n: me?.remaining ?? 0 })}
              </span>
            </>
          )}

          {rows.length > 0 ? <GuessGrid rows={rows} lang={lang} /> : <Legend lang={lang} />}
        </div>

        <aside className="hs-rivals">
          <span className="hs-rivals-title">{t("raceRivals")}</span>
          <RivalCard
            name={t("raceYou")} score={me?.score ?? 0} target={target}
            guesses={me?.guesses?.length ?? 0} done={!!me?.done} mine t={t}
          />
          {rivals.map((r) => (
            <RivalCard
              key={r.steamId}
              name={nameOf(r.steamId)}
              score={r.score}
              target={target}
              guesses={r.guesses}
              done={r.done}
              t={t}
            />
          ))}
        </aside>
      </div>

      <footer className="hs-race-feed">
        {(gameState.logs ?? []).map((l: any) => (
          <div key={l.id}>{renderLog(l, t, nameOf, target)}</div>
        ))}
      </footer>

      <AnimatePresence>
        {finished && (
          <motion.div className="hs-race-final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="hs-final-card"
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
            >
              <h1 className="hs-final-title">
                {iWon ? t("raceWon") : t("raceLost", { name: nameOf(gameState.winner) })}
              </h1>

              <span className="hs-rivals-title">{t("raceStandings")}</span>
              <div className="hs-final-list">
                {standings.map((s: any, i: number) => (
                  <motion.div
                    key={s.steamId}
                    className={`hs-final-row ${s.steamId === mySteamId ? "me" : ""}`}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + i * 0.06 }}
                  >
                    <span>{i + 1}. {nameOf(s.steamId)}</span>
                    <span className="pts">{s.score}/{target}</span>
                  </motion.div>
                ))}
              </div>

              {gameState.sequence?.length > 0 && (
                <>
                  <span className="hs-rivals-title">{t("raceRun")}</span>
                  <div className="hs-run">
                    {gameState.sequence.map((p: any, i: number) => (
                      <span key={`${p.id}-${i}`} className="hs-run-chip">{flagOf(p.cc)} {p.name}</span>
                    ))}
                  </div>
                </>
              )}

              <div className="hs-result-actions">
                {isHost
                  ? <button className="hs-primary" onClick={returnLobby}>{t("returnLobby")}</button>
                  : <button className="hs-primary" onClick={exitGame}>{t("leaveGame")}</button>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

function RivalCard({ name, score, target, guesses, done, mine, t }: {
  name: string; score: number; target: number; guesses: number; done?: boolean; mine?: boolean;
  t: (k: any, p?: any) => string;
}) {
  return (
    <div className={`hs-rival ${mine ? "me" : ""} ${done ? "done" : ""}`}>
      <div className="hs-rival-top">
        <span className="hs-rival-name">{done ? "🏁 " : ""}{name}</span>
        <span className="hs-rival-score">{score}/{target}</span>
      </div>
      <div className="hs-rival-bar">
        <motion.span animate={{ scaleX: Math.max(0.02, score / Math.max(1, target)) }} transition={{ type: "spring", stiffness: 260, damping: 26 }} />
      </div>
      <span className="hs-rival-sub">{t("raceGuessing", { n: guesses })}</span>
    </div>
  );
}

function renderLog(l: any, t: (k: any, p?: any) => string, nameOf: (id: string) => string, target: number): string {
  switch (l.key) {
    case "start": return t("evStart", { n: l.n ?? target });
    case "solved": return t("evSolved", { name: nameOf(l.pid), who: l.word });
    case "revealed": return t("evRevealed", { name: nameOf(l.pid), who: l.word });
    case "timeout": return t("evTimeout", { who: l.word });
    case "win": return t("evWin", { name: nameOf(l.pid) });
    default: return "";
  }
}
