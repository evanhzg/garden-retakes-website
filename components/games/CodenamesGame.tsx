"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { useGameLang, translator, LangToggle, CODENAMES } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import "./shared.css";
import "./codenames.css";

type Team = "red" | "blue";
type CardKind = "red" | "blue" | "neutral" | "assassin" | "double" | "hidden";
type Card = { id: number; word: string; type: CardKind; revealedBy: Team | null };
type Seat = { steamId: string; team: Team | null; spymaster: boolean; isBot: boolean; botName?: string | null };

export default function CodenamesGame() {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";

  const [gameState, setGameState] = useState<any>(null);
  const [clueWord, setClueWord] = useState("");
  const [clueCount, setClueCount] = useState(2);
  const [rejected, setRejected] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);

  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(CODENAMES, lang);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useGameChrome();

  useEffect(() => {
    if (!socket) return;
    const onState = (s: any) => setGameState(s);
    const onReject = () => { setRejected(true); sound.play("error"); setTimeout(() => setRejected(false), 3200); };
    socket.on("codenames_state", onState);
    socket.on("codenames_reject", onReject);
    return () => { socket.off("codenames_state", onState); socket.off("codenames_reject", onReject); };
  }, [socket]);

  // A new clue means a fresh set of guesses — drop any half-tapped card.
  const clueWordServer = gameState?.currentClue?.word ?? null;
  useEffect(() => { setConfirming(null); }, [clueWordServer, gameState?.currentTeam]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [gameState?.logs?.length]);

  const roster: Seat[] = gameState?.roster ?? [];
  const playerIds = useMemo(() => roster.map((r) => r.steamId), [roster]);
  const names = usePlayerNames(playerIds);
  const nameOf = useCallback(
    (id: string) => {
      const seat = roster.find((r) => r.steamId === id);
      if (id === mySteamId) return t("youLabel");
      return displayNameFor(id, names, seat ? { isBot: seat.isBot, botName: seat.botName ?? undefined } : undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, mySteamId, roster, lang]
  );

  useGameEvents(gameState?.events, (e: GameEvent) => {
    switch (e.type) {
      case "start": sound.play("roundStart"); break;
      case "clue": sound.play("hint"); break;
      case "reveal":
        if (e.kind === "assassin") break;               // the assassin event carries its own sound
        else if (e.correct) sound.play("correct");
        else if (e.kind === "neutral") sound.play("close");
        else sound.play("penalty");
        break;
      case "double": sound.play("special"); break;
      case "turn": sound.play("whoosh"); break;
      case "timeout": sound.play("timeUp"); break;
      case "assassin": sound.play("caught"); break;
      case "win": sound.play("fanfare"); break;
    }
  });

  if (!gameState || gameState.status === "WAITING") return null;

  const me = gameState.me ?? {};
  const myTeam: Team | null = me.team ?? null;
  const isSpymaster = !!me.spymaster;
  const finished = gameState.status === "FINISHED";
  const current: Team = gameState.currentTeam;
  const board: Card[] = gameState.board ?? [];
  const size: number = gameState.boardSize ?? 5;
  const clue = gameState.currentClue;
  const canGuess = !!me.canGuess;
  const canClue = !!me.canClue;

  // How many agents each side started with, so the panel bars have a scale.
  const firstCount = size === 6 ? 12 : 9;
  const startTotal = (team: Team) =>
    (team === gameState.startingTeam ? firstCount : firstCount - 1) + (gameState.options?.doubleAgent ? 1 : 0);

  const teamName = (team: Team) => (team === "red" ? t("red") : t("blue"));
  const kindLabel = (kind: string) =>
    kind === "red" ? t("kindRed") : kind === "blue" ? t("kindBlue")
      : kind === "neutral" ? t("kindNeutral") : kind === "assassin" ? t("kindAssassin") : t("kindDouble");

  const submitClue = () => {
    const word = clueWord.trim();
    if (!word) return;
    sound.play("click");
    socket?.emit("codenames_clue", { word, count: clueCount });
    setClueWord("");
  };

  const tapCard = (idx: number) => {
    if (!canGuess || gameState.revealed[idx]) return;
    // Two taps: the first arms the card, the second commits. Misclicking a word
    // in Codenames can hand the game away, so it should never be one tap.
    if (confirming !== idx) { setConfirming(idx); sound.play("click"); return; }
    setConfirming(null);
    socket?.emit("codenames_guess", { cardIndex: idx });
  };

  const stopGuessing = () => { sound.play("click"); socket?.emit("codenames_end_guessing"); };
  const returnLobby = () => socket?.emit("lobby_return");
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/games"; };

  const isHost = gameState.host === mySteamId;
  const timerTotal = gameState.turnTotal || 0;
  const timeRatio = !timerTotal || gameState.timeLeft == null ? 0 : Math.max(0, Math.min(1, gameState.timeLeft / timerTotal));

  const banner = finished ? null
    : canClue ? t("yourTurnClue")
    : canGuess ? t("yourTurnGuess")
    : myTeam == null ? t("spectating", { team: teamName(current) })
    : gameState.phase === "CLUE" ? t("waitingClue", { team: teamName(current) })
    : t("waitingGuess", { team: teamName(current) });

  return createPortal(
    <div className={`cn-root turn-${current} ${isSpymaster ? "is-spymaster" : ""}`}>
      <div className="cn-aurora" aria-hidden />

      {/* ---------------------------------------------------------- top bar */}
      <header className="cn-topbar">
        <div className="cn-brand-block">
          <span className="cn-brand">{t("brand")}</span>
          <span className="cn-phase">{gameState.phase === "CLUE" ? t("phaseClue") : t("phaseGuess")}</span>
        </div>

        <div className="cn-scoreline">
          <ScorePill team="red" n={gameState.remaining.red} active={current === "red"} mine={myTeam === "red"} label={t("red")} />
          <span className="cn-score-vs">vs</span>
          <ScorePill team="blue" n={gameState.remaining.blue} active={current === "blue"} mine={myTeam === "blue"} label={t("blue")} />
        </div>

        <div className="cn-top-right">
          {gameState.timeLeft != null && !finished && (
            <div className={`cn-timer ${gameState.timeLeft <= 10 ? "warning" : ""}`}>{Math.max(0, gameState.timeLeft)}</div>
          )}
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
          <button className="cn-icon-btn" onClick={exitGame} title={t("leaveGame")} aria-label={t("leaveGame")}>✕</button>
        </div>
      </header>
      {gameState.timeLeft != null && !finished && timerTotal > 0 && (
        <div className={`cn-timebar ${gameState.timeLeft <= 10 ? "warning" : ""}`}>
          <span style={{ transform: `scaleX(${timeRatio})` }} />
        </div>
      )}

      {/* ------------------------------------------------------------ stage */}
      <div className="cn-stage">
        <TeamPanel
          team="red" label={t("redTeam")} roster={roster} remaining={gameState.remaining.red}
          total={startTotal("red")} current={current} myTeam={myTeam} nameOf={nameOf} t={t}
        />

        <main className="cn-board-col">
          <motion.div
            key={`${current}-${gameState.phase}`}
            className={`cn-banner ${current}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            {banner}
          </motion.div>

          <AnimatePresence mode="wait">
            {clue && !finished && (
              <motion.div
                key={`${clue.word}-${gameState.currentTeam}`}
                className={`cn-clue ${current}`}
                initial={{ opacity: 0, scale: 0.85, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <span className="cn-clue-label">{t("clueIs")}</span>
                <span className="cn-clue-word">{clue.word}</span>
                <span className="cn-clue-count">{clue.unlimited ? t("unlimited") : clue.count}</span>
                <span className="cn-clue-left">
                  {gameState.guessesLeft == null ? t("unlimitedGuesses")
                    : gameState.guessesLeft === 1 ? t("oneGuessLeft")
                    : t("guessesLeft", { n: gameState.guessesLeft })}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`cn-grid size-${size}`} style={{ ["--cols" as any]: size }}>
            {board.map((card, idx) => {
              const isRevealed = gameState.revealed[idx];
              const known = card.type !== "hidden";
              const armed = confirming === idx;
              return (
                <motion.button
                  key={card.id}
                  className={[
                    "cn-card",
                    isRevealed ? `revealed kind-${card.type}` : "",
                    !isRevealed && known ? `keyed key-${card.type}` : "",
                    armed ? "armed" : "",
                    canGuess && !isRevealed ? "tappable" : "",
                  ].join(" ")}
                  disabled={!canGuess || isRevealed}
                  onClick={() => tapCard(idx)}
                  onBlur={() => armed && setConfirming(null)}
                  initial={{ opacity: 0, y: 14, rotateX: -25 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: Math.min(0.5, idx * 0.014), type: "spring", stiffness: 260, damping: 22 }}
                  whileHover={canGuess && !isRevealed ? { y: -3 } : undefined}
                  whileTap={canGuess && !isRevealed ? { scale: 0.97 } : undefined}
                >
                  <span className="cn-card-inner">
                    <span className="cn-card-word">{card.word}</span>
                    {armed && <span className="cn-card-confirm">✓</span>}
                    {isRevealed && card.type === "assassin" && <span className="cn-card-glyph">💀</span>}
                    {isRevealed && card.type === "double" && <span className="cn-card-glyph">⚑</span>}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* --------------------------------------------------- action bar */}
          <div className="cn-actions">
            {finished ? null : canClue ? (
              <div className="cn-clue-form">
                <input
                  className="cn-clue-input"
                  value={clueWord}
                  onChange={(e) => setClueWord(e.target.value.replace(/\s+/g, " ").trimStart())}
                  onKeyDown={(e) => e.key === "Enter" && submitClue()}
                  placeholder={t("cluePlaceholder")}
                  maxLength={24}
                  autoFocus
                />
                <div className="cn-count-picker" role="group" aria-label={t("clueCount")}>
                  {(gameState.options?.zeroClue ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]).map((n) => (
                    <button key={n} className={clueCount === n ? "on" : ""} onClick={() => setClueCount(n)}>
                      {n === 0 ? t("unlimited") : n}
                    </button>
                  ))}
                </div>
                <button className="cn-primary" onClick={submitClue} disabled={!clueWord.trim()}>
                  {t("giveClue")} ▸
                </button>
              </div>
            ) : canGuess ? (
              <button
                className="cn-secondary"
                onClick={stopGuessing}
                disabled={!gameState.guessesThisTurn}
                title={!gameState.guessesThisTurn ? t("mustGuessOnce") : undefined}
              >
                {t("endGuessing")}
              </button>
            ) : isSpymaster && gameState.phase === "GUESS" ? (
              <span className="cn-hold">{t("spymasterHold")}</span>
            ) : null}

            {isSpymaster && <span className="cn-keycard-note">🕵️ {t("keyCard")}</span>}
          </div>

          <AnimatePresence>
            {rejected && (
              <motion.div className="cn-toast" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {t("clueRejected")}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <TeamPanel
          team="blue" label={t("blueTeam")} roster={roster} remaining={gameState.remaining.blue}
          total={startTotal("blue")} current={current} myTeam={myTeam} nameOf={nameOf} t={t}
        />
      </div>

      {/* ------------------------------------------------------------- feed */}
      <footer className="cn-feed" ref={feedRef}>
        {(gameState.logs ?? []).map((l: any) => (
          <div key={l.id} className={`cn-feed-line ${l.team ?? ""}`}>
            {renderLog(l, t, nameOf, teamName, kindLabel)}
          </div>
        ))}
      </footer>

      {/* ---------------------------------------------------------- endgame */}
      <AnimatePresence>
        {finished && (
          <motion.div className="cn-final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className={`cn-final-card ${gameState.winner}`}
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
            >
              <span className="cn-final-kicker">{t("gameOver")}</span>
              <h1 className={`cn-final-team ${gameState.winner}`}>{teamName(gameState.winner)}</h1>
              <p className="cn-final-reason">
                {gameState.winReason === "assassin"
                  ? t("winsAssassin", { loser: teamName(gameState.winner === "red" ? "blue" : "red"), team: teamName(gameState.winner) })
                  : gameState.winReason === "forfeit"
                    ? t("winsForfeit", { team: teamName(gameState.winner) })
                    : t("winsAgents", { team: teamName(gameState.winner) })}
              </p>
              {myTeam && (
                <p className={`cn-final-verdict ${myTeam === gameState.winner ? "won" : "lost"}`}>
                  {myTeam === gameState.winner ? t("youWon") : t("youLost")}
                </p>
              )}
              <div className="cn-final-actions">
                {isHost
                  ? <button className="cn-primary" onClick={returnLobby}>{t("returnLobby")}</button>
                  : <button className="cn-primary" onClick={exitGame}>{t("leaveGame")}</button>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------

function ScorePill({ team, n, active, mine, label }: {
  team: Team; n: number; active: boolean; mine: boolean; label: string;
}) {
  return (
    <div className={`cn-score-pill ${team} ${active ? "active" : ""} ${mine ? "mine" : ""}`}>
      <span className="cn-score-team">{label}</span>
      <motion.span key={n} className="cn-score-n" initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 18 }}>
        {n}
      </motion.span>
    </div>
  );
}

function TeamPanel({ team, label, roster, remaining, total, current, myTeam, nameOf, t }: {
  team: Team; label: string; roster: Seat[]; remaining: number; total: number;
  current: Team; myTeam: Team | null; nameOf: (id: string) => string; t: (k: any, p?: any) => string;
}) {
  const members = roster.filter((r) => r.team === team);
  return (
    <aside className={`cn-team ${team} ${current === team ? "active" : ""} ${myTeam === team ? "mine" : ""}`}>
      <div className="cn-team-head">
        <span className="cn-team-name">{label}</span>
        <span className="cn-team-left">{t("agentsLeft", { n: remaining })}</span>
      </div>
      <div className="cn-team-list">
        {members.map((m) => (
          <div key={m.steamId} className={`cn-seat ${m.spymaster ? "spy" : ""}`}>
            <span className="cn-seat-dot" />
            <span className="cn-seat-name">{nameOf(m.steamId)}</span>
            <span className="cn-seat-role">{m.spymaster ? "🕵️" : ""}</span>
          </div>
        ))}
      </div>
      <div className="cn-team-bar" aria-hidden>
        <motion.span layout animate={{ scaleX: Math.max(0.02, remaining / Math.max(1, total)) }} />
      </div>
    </aside>
  );
}

/** Server logs arrive as `{ key, ...params }` so they can be read in either language. */
function renderLog(
  l: any,
  t: (k: any, p?: any) => string,
  nameOf: (id: string) => string,
  teamName: (team: Team) => string,
  kindLabel: (kind: string) => string
): string {
  switch (l.key) {
    case "start": return t("logStart", { team: teamName(l.team) });
    case "clue": return t("logClue", { name: nameOf(l.pid), word: l.word, count: l.unlimited ? "∞" : l.count });
    case "pick": return t("logPick", { name: nameOf(l.pid), word: l.word, kind: kindLabel(l.kind) });
    case "double": return t("logDouble", { name: nameOf(l.pid) });
    case "clueTimeout": return t("logClueTimeout", { team: teamName(l.team) });
    case "newSpymaster": return t("logNewSpymaster", { name: nameOf(l.pid), team: teamName(l.team) });
    case "win": return t("logWin", { team: teamName(l.team) });
    case "endTurn":
      return t(
        l.reason === "miss" ? "logMiss"
          : l.reason === "outOfGuesses" ? "logOutOfGuesses"
          : l.reason === "timeout" ? "logTimeout"
          : "logStopped",
        { team: teamName(l.team) }
      );
    default: return "";
  }
}
