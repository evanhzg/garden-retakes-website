"use client";

// The lobby race screen for the daily guessers.
//
// HEADSHOT and PENTAKILL race identically — same rails, same board, same
// endgame — so the screen is written once and the game passes in its dictionary,
// its column schema and its socket event names. The server owns the answers and
// scores every guess, so this component only ever knows its own board.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { useGameLang, translator, LangToggle, type Lang } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import { SearchBox, GuessGrid, Legend, ColumnToggles, type GuessColumn, type GuessRow } from "@/components/games/guess/GuessBoard";
import "@/components/games/shared.css";
import "@/components/games/headshot/headshot.css";

type Rival = { steamId: string; isBot: boolean; botName?: string | null; score: number; guesses: number; done: boolean };

export function RaceScreen<T extends { id: string }>({
  dict, stateEvent, guessEvent, columns, pool, byId, search,
  renderOption, renderHead, renderChip, headLabel, rootClass, icon, ready,
}: {
  dict: any;
  stateEvent: string;
  guessEvent: string;
  columns: GuessColumn<T>[];
  pool: T[];
  byId: Map<string, T>;
  search: (query: string, pool: T[], limit: number, exclude: string[]) => T[];
  renderOption: (item: T) => React.ReactNode;
  renderHead: (item: T, lang: Lang) => React.ReactNode;
  renderChip: (chip: any) => React.ReactNode;
  /** i18n key for the first column header. */
  headLabel: string;
  rootClass?: string;
  icon?: string;
  /** False while the pool is still loading. */
  ready: boolean;
}) {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";

  const [gameState, setGameState] = useState<any>(null);
  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(dict, lang);

  const [activeCols, setActiveCols] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(`garden_cols_${headLabel}`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set(columns.map(c => c.key));
  });

  const toggleCol = useCallback((key: string) => {
    setActiveCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add(key); // prevent all off
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`garden_cols_${headLabel}`, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }, [headLabel]);

  const activeColumns = useMemo(() => columns.filter(c => activeCols.has(c.key)), [columns, activeCols]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useGameChrome();

  useEffect(() => {
    if (!socket) return;
    const onState = (s: any) => setGameState(s);
    socket.on(stateEvent, onState);
    return () => { socket.off(stateEvent, onState); };
  }, [socket, stateEvent]);

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

  const submit = useCallback((item: T) => {
    sound.play("click");
    socket?.emit(guessEvent, { player: item.id });
  }, [socket, guessEvent]);

  if (!gameState || gameState.status === "WAITING") return null;

  const me = gameState.me;
  const finished = gameState.status === "FINISHED";
  const target = gameState.targetScore ?? 5;
  const guessedIds: string[] = (me?.guesses ?? []).map((g: any) => g.id);

  // The server already scored every guess — just pair each one with its item.
  const rows: GuessRow<T>[] = ready
    ? (me?.guesses ?? [])
      .map((g: any) => {
        const item = byId.get(g.id);
        return item ? { item, result: g.result } : null;
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
    <div className={`hs-race ${rootClass ?? ""}`}>
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
          {!ready ? (
            <div className="hs-loading"><span className="hs-spinner" />{t("loading")}</div>
          ) : finished || me?.done ? null : (
            <>
              <SearchBox
                pool={pool}
                exclude={guessedIds}
                onPick={submit}
                autoFocus
                icon={icon}
                placeholder={t("searchPlaceholder")}
                emptyLabel={t("noMatches")}
                search={search}
                renderOption={renderOption}
              />
              <span className="hs-guess-count">{t("raceRevealIn", { n: me?.remaining ?? 0 })}</span>
            </>
          )}

          {rows.length > 0
            ? (
              <>
                <ColumnToggles columns={columns} active={activeCols} onToggle={toggleCol} t={t} />
                <GuessGrid rows={rows} columns={activeColumns} lang={lang} t={t} headLabel={t(headLabel)} renderHead={renderHead} />
              </>
            )
            : <Legend t={t} />}
        </div>

        <aside className="hs-rivals">
          <span className="hs-rivals-title">{t("raceRivals")}</span>
          <RivalCard name={t("raceYou")} score={me?.score ?? 0} target={target} guesses={me?.guesses?.length ?? 0} done={!!me?.done} mine t={t} />
          {rivals.map((r) => (
            <RivalCard key={r.steamId} name={nameOf(r.steamId)} score={r.score} target={target} guesses={r.guesses} done={r.done} t={t} />
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
                    {gameState.sequence.map((chip: any, i: number) => (
                      <span key={`${chip.id}-${i}`} className="hs-run-chip">{renderChip(chip)}</span>
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
