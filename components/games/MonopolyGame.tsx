"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Lang, money, fmtMoney, spaceName, spaceShort, GROUP_LABEL, cardTitle, cardBody,
  tileFullName, tileShortName, groupLabelOf,
  t, localizeLog, logCategory, UI,
} from "@/components/games/monopolyData";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound, type SoundName } from "@/components/games/sound/SoundManager";
import { GROUP_COLORS } from "./monopoly3d/theme";
import "./monopoly.css";

// The 3D board (react-three-fiber) is client-only.
const Board3D = dynamic(() => import("./monopoly3d/Board3D"), { ssr: false });

// ---------------------------------------------------------------------------
// 3D-styled pawn — a little colour-shaded figure that stands on the board.
// ---------------------------------------------------------------------------
function Pawn({ color, size = 26, active = false }: { color: string; size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size * 1.32}
      viewBox="0 0 48 64"
      className={`pawn-svg ${active ? "active" : ""}`}
      style={{ filter: active ? `drop-shadow(0 0 6px ${color})` : "drop-shadow(0 4px 4px rgba(0,0,0,.5))" }}
    >
      {/* ground shadow */}
      <ellipse cx="24" cy="59" rx="14" ry="4" fill="rgba(0,0,0,.4)" />
      {/* body + head in player colour */}
      <g fill={color} stroke="rgba(0,0,0,.28)" strokeWidth="1.4">
        <path d="M24 14 C20 14 18 18 19 24 C12 28 7 42 7 54 L41 54 C41 42 36 28 29 24 C30 18 28 14 24 14 Z" />
        <circle cx="24" cy="12" r="9" />
      </g>
      {/* rim light + head highlight for a glossy 3D read */}
      <path d="M24 14 C20 14 18 18 19 24 C12 28 7 42 7 54" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="20.5" cy="9" rx="3" ry="3.8" fill="rgba(255,255,255,.6)" />
    </svg>
  );
}

// Colour-set pips: one chip per property group the player owns ≥1 of; a fully
// owned set (monopoly) gets a bright ring.
function SetPips({ stats, colorOf }: { stats: Record<string, { total: number; owned: number }>; colorOf: (g: string) => string }) {
  const groups = Object.keys(stats).filter((g) => stats[g].owned > 0);
  if (!groups.length) return null;
  return (
    <span className="mono-pips">
      {groups.map((g) => {
        const { owned, total } = stats[g];
        const mono = owned === total;
        return <span key={g} className={`mono-pip${mono ? " mono" : ""}`} style={{ background: colorOf(g) }} title={`${g} ${owned}/${total}`} />;
      })}
    </span>
  );
}

const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000);

// Which inner edge a tile's colour bar / content faces (toward the board centre).
function tileEdge(id: number): "top" | "right" | "bottom" | "left" | "corner" {
  if ([0, 10, 20, 30].includes(id)) return "corner";
  if (id >= 1 && id <= 9) return "top";       // bottom row → bar on top
  if (id >= 11 && id <= 19) return "right";    // left col → bar on right
  if (id >= 21 && id <= 29) return "bottom";   // top row → bar on bottom
  return "left";                               // right col → bar on left
}

export default function MonopolyGame() {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? DUMMY_STEAM_ID;
  const [gameState, setGameState] = useState<any>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [hoveredSpace, setHoveredSpace] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [rollTriggerKey, setRollTriggerKey] = useState(0);
  const prevRollIdRef = useRef<string | null>(null);

  // View mode: 3D orbit · locked top-down 2D · Business Tour hero style (persisted).
  const [viewMode, setViewMode] = useState<"3d" | "2d" | "bt">("3d");
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem("mono_view") : null;
    if (v === "2d" || v === "3d" || v === "bt") setViewMode(v);
  }, []);
  const chooseView = (v: "3d" | "2d" | "bt") => { setViewMode(v); try { window.localStorage.setItem("mono_view", v); } catch {} };

  // Card popup shown when the server reports a freshly drawn card.
  const [shownCard, setShownCard] = useState<any>(null);
  const prevDrawIdRef = useRef<string | null>(null);

  // Sound: fire an SFX when the newest log entry changes.
  const prevLogIdRef = useRef<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on("monopoly_state", (state) => setGameState(state));
    return () => { socket.off("monopoly_state"); };
  }, [socket]);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.rollId && gameState.rollId !== prevRollIdRef.current) {
      setRollTriggerKey((k) => k + 1);
      setIsDiceRolling(true);
      prevRollIdRef.current = gameState.rollId;
      sound.play("dice");
    } else if (!gameState.rollId) {
      // Turn was reset (no dice on the board): never leave controls stuck in the
      // "rolling" state — the dice unmount without firing onAnimationComplete.
      prevRollIdRef.current = null;
      setIsDiceRolling(false);
    }
    const card = gameState.activeCard;
    if (card && card.drawId !== prevDrawIdRef.current) {
      prevDrawIdRef.current = card.drawId;
      setShownCard(card);
    }
  }, [gameState]);

  // Auto-dismiss the card popup after a few seconds.
  useEffect(() => {
    if (!shownCard) return;
    const timer = setTimeout(() => setShownCard(null), 5200);
    return () => clearTimeout(timer);
  }, [shownCard]);

  // Ultimate backstop: never let the dice-rolling flag strand the controls,
  // no matter what happens inside the 3D roll (physics, canvas remounts, etc.).
  useEffect(() => {
    if (!isDiceRolling) return;
    const timer = setTimeout(() => setIsDiceRolling(false), 5500);
    return () => clearTimeout(timer);
  }, [isDiceRolling, rollTriggerKey]);

  // Map the newest activity-log entry to a sound effect.
  useEffect(() => {
    const top = gameState?.logs?.[0];
    if (!top) return;
    if (top.id === prevLogIdRef.current) return;
    const first = prevLogIdRef.current === null;
    prevLogIdRef.current = top.id;
    if (first) return; // don't replay a sound for pre-existing state on mount
    const map: Record<string, SoundName> = {
      buy: "buy", build: "build", pay_rent: "rent", pay_tax: "tax",
      pass_go: "passGo", jail_enter: "jail", card: "card",
      bankrupt: "bankrupt", win: "win",
      mortgage: "mortgage", unmortgage: "unmortgage", sell_house: "sell",
      special: "special", world_cup_move: "worldCup", jackpot_win: "jackpot",
      auction_start: "auction", auction_won: "buy",
    };
    const sfx = map[top.key];
    if (sfx) sound.play(sfx);
  }, [gameState?.logs]);

  const lang: Lang = (gameState?.lang === "fr" ? "fr" : "en");

  // Resolve human display names via the shared hook.
  const numericIds = useMemo(
    () => (gameState?.players || []).filter((p: string) => /^\d{5,20}$/.test(p)),
    [gameState?.players]
  );
  const resolvedNames = usePlayerNames(numericIds);

  const nameOf = (pid: string): string => {
    if (!pid) return "";
    if (pid === mySteamId) return t("you", lang);
    const ps = gameState?.playerStates?.[pid];
    if (ps?.isBot) return ps.name ? ps.name : t("bot", lang);
    if (pid.startsWith("BOT_")) return t("bot", lang);
    if (pid.startsWith("GUEST_")) return `${lang === "fr" ? "Invité" : "Guest"} ${pid.slice(-4).toUpperCase()}`;
    return resolvedNames[pid]?.name ?? `${lang === "fr" ? "Joueur" : "Player"} ${pid.slice(-4)}`;
  };

  const rollDice = () => socket?.emit("monopoly_roll");
  const buyProperty = () => socket?.emit("monopoly_buy");
  const skipBuy = () => socket?.emit("monopoly_skip");
  const placeBid = (amount: number) => socket?.emit("monopoly_bid", { amount });
  const passAuction = () => socket?.emit("monopoly_auction_pass");
  const endTurn = () => socket?.emit("monopoly_end_turn");
  const payJail = () => socket?.emit("monopoly_pay_jail");
  const useJailCard = () => socket?.emit("monopoly_use_card");
  const buildHouse = (spaceId: number) => socket?.emit("monopoly_build", { spaceId });
  const sellHouse = (spaceId: number) => socket?.emit("monopoly_sell", { spaceId });
  const mortgage = (spaceId: number) => socket?.emit("monopoly_mortgage", { spaceId });
  const unmortgage = (spaceId: number) => socket?.emit("monopoly_unmortgage", { spaceId });
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/"; };

  if (!gameState || gameState.status === "WAITING") return null;

  // Board-aware formatting: the classic board keeps its localized names/$; themed
  // or custom boards carry their own names + currency in boardMeta.
  const boardMeta = gameState.boardMeta;
  const boardId = boardMeta?.boardId || gameState.boardId || "classic";
  const currency = boardId === "classic" ? null : boardMeta?.currency;
  const fmt = (a: number) => fmtMoney(a, lang, currency);
  const nameFull = (space: any) => tileFullName(space, boardId, lang);
  const nameShort = (space: any) => tileShortName(space, boardId, lang);

  const isMyTurn = gameState.currentTurn === mySteamId;
  const myState = gameState.playerStates[mySteamId];
  const teamMode = gameState.teamMode === "2v2" ? "2v2" : "ffa";
  const myTeam = myState?.team;
  const teamLabel = (team: number | null | undefined) => (team === 0 ? "A" : team === 1 ? "B" : null);
  const phase = gameState.turnPhase;
  const currentSpace = myState ? gameState.board[myState.position] : null;
  const canBuyHere =
    currentSpace &&
    ["property", "rail", "util"].includes(currentSpace.type) &&
    currentSpace.owner == null &&
    myState.money >= currentSpace.price;

  const propertyCount = (pid: string) =>
    gameState.board.filter((s: any) => s.owner === pid).length;

  // ---- richer per-player derived stats (for the cards + own HUD) ----
  const typeCount = (pid: string, type: string) =>
    gameState.board.filter((s: any) => s.owner === pid && s.type === type).length;
  const holdingsValue = (pid: string) =>
    gameState.board.reduce((sum: number, s: any) => {
      if (s.owner !== pid) return sum;
      let v = 0;
      if (s.price) v += s.mortgaged ? Math.floor(s.price / 2) : s.price;
      if (s.houses && s.houseCost) v += s.houseCost * s.houses;
      return sum + v;
    }, 0);
  const netWorth = (pid: string) => (gameState.playerStates[pid]?.money || 0) + holdingsValue(pid);
  const groupStats = (pid: string): Record<string, { total: number; owned: number }> => {
    const stats: Record<string, { total: number; owned: number }> = {};
    for (const s of gameState.board) {
      if (s.type !== "property" || !s.group) continue;
      let g = stats[s.group];
      if (!g) g = stats[s.group] = { total: 0, owned: 0 };
      g.total++;
      if (s.owner === pid) g.owned++;
    }
    return stats;
  };
  const groupColorOf = (g: string) => boardMeta?.theme?.groupColors?.[g] || GROUP_COLORS[g] || "#888";

  const selectedSpace = selectedSpaceId !== null ? gameState.board[selectedSpaceId] : null;

  const ownsFullGroup = (space: any) => {
    if (!space?.group) return false;
    const group = gameState.board.filter((s: any) => s.group === space.group);
    return group.every((s: any) => s.owner === space.owner);
  };

  return createPortal(
    <div className="mono-root" data-lang={lang}>
      {/* ================= TOP BAR ================= */}
      <header className="mono-topbar">
        <div className="mono-brand">
          <span className="mono-brand-dot" /> MONOPOLY
          <span className="mono-brand-lang">{lang.toUpperCase()}</span>
        </div>
        <div className="mono-topbar-right">
          <div className={`mono-turn-banner ${isMyTurn ? "mine" : ""}`}>
            {isMyTurn ? (
              <>
                <span className="mono-turn-pulse" />
                {phase === "ROLL" && gameState.isDouble ? t("doubles", lang) : t("yourTurn", lang)}
              </>
            ) : (
              t("turnOf", lang, { name: nameOf(gameState.currentTurn) })
            )}
          </div>
          <div className="mono-view-toggle" role="group" aria-label="View">
            <button className={viewMode === "3d" ? "on" : ""} onClick={() => chooseView("3d")}>3D</button>
            <button className={viewMode === "2d" ? "on" : ""} onClick={() => chooseView("2d")}>2D</button>
            <button className={viewMode === "bt" ? "on bt" : "bt"} onClick={() => chooseView("bt")} title="Business Tour style">BT</button>
          </div>
          <SoundControls />
          <button className="mono-exit" onClick={exitGame} title={lang === "fr" ? "Quitter la partie" : "Leave game"}>✕</button>
        </div>
      </header>

      <div className="mono-stage">
        {/* ================= PLAYER PANEL (opponents) ================= */}
        <aside className="mono-players-col">
          {gameState.players.filter((pid: string) => !myState || pid !== mySteamId).map((pid: string) => {
            const s = gameState.playerStates[pid];
            const isTurn = gameState.currentTurn === pid;
            const rails = typeCount(pid, "rail");
            const utils = typeCount(pid, "util");
            return (
              <motion.div
                layout
                key={pid}
                className={`mono-pcard ${isTurn ? "active" : ""} ${s.bankrupt ? "bankrupt" : ""} ${teamMode === "2v2" && s.team === myTeam ? "ally" : ""}`}
                style={{ ["--pc" as any]: s.color }}
                transition={{ type: "spring", stiffness: 200, damping: 24 }}
              >
                <div className="mono-pcard-token">
                  <Pawn color={s.color} size={30} active={isTurn} />
                </div>
                <div className="mono-pcard-body">
                  <div className="mono-pcard-top">
                    <span className="mono-pcard-name">{nameOf(pid)}</span>
                    {teamMode === "2v2" && teamLabel(s.team) && (
                      <span className={`mono-team-chip t${s.team}${s.team === myTeam ? " mine" : ""}`}>
                        {teamLabel(s.team)}{s.team === myTeam ? ` · ${lang === "fr" ? "allié" : "ally"}` : ""}
                      </span>
                    )}
                    {s.jailCards > 0 && <span className="mono-chip">🎟 {s.jailCards}</span>}
                  </div>
                  <div className="mono-pcard-cash">
                    {fmt(s.money)}
                    {!s.bankrupt && <span className="mono-pcard-net">{lang === "fr" ? "val." : "net"} {fmt(netWorth(pid))}</span>}
                  </div>
                  <div className="mono-pcard-holdings">
                    <SetPips stats={groupStats(pid)} colorOf={groupColorOf} />
                    <span className="mono-pcard-counts">
                      <span title={t("properties", lang)}>🏠 {propertyCount(pid)}</span>
                      {rails > 0 && <span title="rail">🚂 {rails}</span>}
                      {utils > 0 && <span title="utility">💡 {utils}</span>}
                    </span>
                  </div>
                  <div className="mono-pcard-meta">
                    {s.jailed && <span className="mono-jail-tag">⛓ {t("inJail", lang)}</span>}
                    {s.bankrupt && <span className="mono-jail-tag">💀 {t("bankrupt", lang)}</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </aside>

        {/* ================= BOARD (3D) ================= */}
        <div className="mono-board3d">
          <Board3D
            gameState={gameState}
            lang={lang}
            boardMeta={boardMeta}
            viewMode={viewMode}
            onSelectSpace={setSelectedSpaceId}
            onHoverSpace={(space, e) => {
              setHoveredSpace(space);
              const ne: any = (e as any)?.nativeEvent;
              if (ne) setMousePos({ x: ne.clientX, y: ne.clientY });
            }}
            onHoverEnd={() => setHoveredSpace(null)}
            rollKey={rollTriggerKey}
            lastRoll={gameState.lastRoll}
            onDiceSettled={() => { setIsDiceRolling(false); sound.play("diceLand"); }}
          />
          <div className="mono-board3d-hint">🖱 {viewMode === "2d"
            ? (lang === "fr" ? "Glissez pour déplacer · molette pour zoomer" : "Drag to pan · scroll to zoom")
            : (lang === "fr" ? "Glissez pour tourner · molette pour zoomer" : "Drag to orbit · scroll to zoom")}</div>
          {gameState.lastRoll && (
            <div className="mono-roll-readout mono-roll-readout-3d">
              {t("rolled", lang, { a: gameState.lastRoll[0], b: gameState.lastRoll[1], t: gameState.lastRoll[0] + gameState.lastRoll[1] })}
            </div>
          )}
          {gameState.moduleState?.jackpot && (
            <div className="mono-jackpot-readout" title={lang === "fr" ? "Cagnotte du Parc Gratuit" : "Free-Parking jackpot"}>
              🅿️ {lang === "fr" ? "Cagnotte" : "Jackpot"} · {fmt(gameState.moduleState.jackpot.pot)}
            </div>
          )}
        </div>

        {/* ================= ACTIVITY LOG ================= */}
        <aside className="mono-log-col">
          <h3 className="mono-log-title">{t("log", lang)}</h3>
          <div className="mono-log-list">
            <AnimatePresence initial={false}>
              {gameState.logs.map((l: any) => (
                <motion.div
                  key={l.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`mono-log-entry ${logCategory(l.key)}`}
                >
                  {localizeLog(l.key, l.params, { lang, nameOf, currency, boardId, board: gameState.board })}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </aside>
      </div>

      {/* ================= BOTTOM HUD (own card + actions) ================= */}
      <div className="mono-hud">
        {myState && !myState.bankrupt && (
          <div className={`mono-hud-me ${isMyTurn ? "active" : ""}`} style={{ ["--pc" as any]: myState.color }}>
            <div className="mono-hud-token">
              <Pawn color={myState.color} size={40} active={isMyTurn} />
            </div>
            <div className="mono-hud-info">
              <div className="mono-hud-name">
                {nameOf(mySteamId)} <span className="mono-hud-you">{lang === "fr" ? "VOUS" : "YOU"}</span>
                {teamMode === "2v2" && teamLabel(myTeam) && <span className={`mono-team-chip t${myTeam} mine`}>{lang === "fr" ? "Équipe" : "Team"} {teamLabel(myTeam)}</span>}
                {myState.jailCards > 0 && <span className="mono-chip">🎟 {myState.jailCards}</span>}
                {myState.jailed && <span className="mono-jail-tag">⛓ {t("inJail", lang)}</span>}
              </div>
              <div className="mono-hud-money">
                <span className="mono-hud-cash">{fmt(myState.money)}</span>
                <span className="mono-hud-net">{lang === "fr" ? "Valeur nette" : "Net worth"} · {fmt(netWorth(mySteamId))}</span>
              </div>
              <div className="mono-hud-holdings">
                <SetPips stats={groupStats(mySteamId)} colorOf={groupColorOf} />
                <span className="mono-pcard-counts">
                  <span title={t("properties", lang)}>🏠 {propertyCount(mySteamId)}</span>
                  {typeCount(mySteamId, "rail") > 0 && <span title="rail">🚂 {typeCount(mySteamId, "rail")}</span>}
                  {typeCount(mySteamId, "util") > 0 && <span title="utility">💡 {typeCount(mySteamId, "util")}</span>}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mono-hud-actions">
          {isMyTurn && myState && !myState.bankrupt ? (
            <>
              {phase === "ROLL" && (
                <button className="mono-btn primary" disabled={isDiceRolling} onClick={rollDice}>
                  🎲 {isDiceRolling ? t("rolling", lang) : t("rollDice", lang)}
                </button>
              )}
              {phase === "ACTION" && canBuyHere && (
                <>
                  <button className="mono-btn buy" disabled={isDiceRolling} onClick={buyProperty}>
                    💰 {t("buy", lang)} · {nameShort(currentSpace)} · {fmt(currentSpace.price)}
                  </button>
                  <button className="mono-btn ghost" disabled={isDiceRolling} onClick={skipBuy}>
                    {t("skip", lang)}
                  </button>
                </>
              )}
              {phase === "ACTION" && !canBuyHere && (
                <button className="mono-btn ghost" disabled={isDiceRolling} onClick={skipBuy}>
                  {t("skip", lang)}
                </button>
              )}
              {phase === "END" && (
                <button className="mono-btn end" disabled={isDiceRolling} onClick={endTurn}>
                  {t("endTurn", lang)} ▸
                </button>
              )}

              {myState.jailed && phase === "ROLL" && (
                <>
                  <button className="mono-btn jail" disabled={myState.money < 50} onClick={payJail}>
                    🔓 {t("payJail", lang, { amt: fmt(50) })}
                  </button>
                  {myState.jailCards > 0 && (
                    <button className="mono-btn jail" onClick={useJailCard}>🎟 {t("useCard", lang)}</button>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="mono-dock-waiting">
              <Pawn color={gameState.playerStates[gameState.currentTurn]?.color || "#888"} size={22} active />
              {t("turnOf", lang, { name: nameOf(gameState.currentTurn) })}
            </div>
          )}
        </div>
      </div>

      {/* ================= CARD POPUP ================= */}
      <AnimatePresence>
        {shownCard && (
          <motion.div
            className="mono-card-popup-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShownCard(null)}
          >
            <motion.div
              className={`mono-card ${shownCard.deck}`}
              initial={{ rotateY: 90, y: 40, opacity: 0 }}
              animate={{ rotateY: 0, y: 0, opacity: 1 }}
              exit={{ rotateY: -90, opacity: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 15 }}
            >
              <div className="mono-card-deck">
                {shownCard.deck === "chance" ? t("chanceDeck", lang) : t("chestDeck", lang)}
              </div>
              <div className="mono-card-icon">{shownCard.deck === "chance" ? "?" : "🧰"}</div>
              <div className="mono-card-title">{cardTitle(shownCard.cardId, lang)}</div>
              <div className="mono-card-body">{cardBody(shownCard.cardId, lang)}</div>
              <div className="mono-card-who">{nameOf(shownCard.pid)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= AUCTION MODAL ================= */}
      <AnimatePresence>
        {gameState.turnPhase === "AUCTION" && gameState.moduleState?.auction && (() => {
          const a = gameState.moduleState.auction;
          const tile = gameState.board[a.spaceId];
          const myTurnToBid = a.activePid === mySteamId;
          const nextBid = a.highBid + a.increment;
          const canAfford = myState && myState.money >= nextBid && !myState.bankrupt;
          return (
            <motion.div className="mono-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="mono-auction" initial={{ y: 40, scale: 0.92, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
                <div className="mono-auction-head">🔨 {lang === "fr" ? "Enchères" : "Auction"}</div>
                <div className="mono-auction-tile">{nameFull(tile)}</div>
                <div className="mono-auction-bid">
                  <span className="mono-auction-label">{lang === "fr" ? "Meilleure offre" : "Top bid"}</span>
                  <span className="mono-auction-amount">{a.highBid > 0 ? fmt(a.highBid) : "—"}</span>
                  {a.highBidder && <span className="mono-auction-by">{nameOf(a.highBidder)}</span>}
                </div>
                {myTurnToBid ? (
                  <div className="mono-auction-actions">
                    <button className="mono-btn primary" disabled={!canAfford} onClick={() => placeBid(nextBid)}>
                      {lang === "fr" ? "Miser" : "Bid"} {fmt(nextBid)}
                    </button>
                    <button className="mono-btn ghost" onClick={passAuction}>{lang === "fr" ? "Passer" : "Pass"}</button>
                  </div>
                ) : (
                  <div className="mono-auction-waiting">
                    {a.activePid
                      ? t("turnOf", lang, { name: nameOf(a.activePid) })
                      : (lang === "fr" ? "Résolution…" : "Resolving…")}
                  </div>
                )}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ================= PROPERTY MODAL ================= */}
      <AnimatePresence>
        {selectedSpace && (
          <motion.div
            className="mono-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedSpaceId(null); }}
          >
            <motion.div
              className="mono-deed"
              initial={{ y: 40, scale: 0.92, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 40, scale: 0.92, opacity: 0 }}
            >
              <div className={`mono-deed-header ${selectedSpace.group || selectedSpace.type}`}>
                <span className="mono-deed-group">
                  {groupLabelOf(selectedSpace, boardId, lang)}
                </span>
                <span className="mono-deed-name">{nameFull(selectedSpace)}</span>
              </div>

              <div className="mono-deed-body">
                {selectedSpace.type === "property" && (
                  <table className="mono-rent-table">
                    <tbody>
                      <tr><td>{t("baseRent", lang)}</td><td>{fmt(selectedSpace.rent[0])}</td></tr>
                      <tr><td>{t("withSet", lang)}</td><td>{fmt(selectedSpace.rent[0] * 2)}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 1 })}</td><td>{fmt(selectedSpace.rent[1])}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 2 })}</td><td>{fmt(selectedSpace.rent[2])}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 3 })}</td><td>{fmt(selectedSpace.rent[3])}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 4 })}</td><td>{fmt(selectedSpace.rent[4])}</td></tr>
                      <tr className="hotel-row"><td>{t("withHotel", lang)}</td><td>{fmt(selectedSpace.rent[5])}</td></tr>
                    </tbody>
                  </table>
                )}
                {selectedSpace.type === "rail" && <p className="mono-deed-note">{t("railRent", lang)}</p>}
                {selectedSpace.type === "util" && <p className="mono-deed-note">{t("utilRent", lang)}</p>}

                <div className="mono-deed-facts">
                  {selectedSpace.price != null && <span>{t("price", lang)}: <b>{fmt(selectedSpace.price)}</b></span>}
                  {selectedSpace.type === "property" && <span>{t("perHouse", lang)}: <b>{fmt(selectedSpace.houseCost)}</b></span>}
                  <span>
                    {selectedSpace.owner
                      ? t("ownedBy", lang, { name: nameOf(selectedSpace.owner) })
                      : t("unowned", lang)}
                  </span>
                  {selectedSpace.mortgaged && <span className="mono-mortgaged-tag">{t("mortgaged", lang)}</span>}
                </div>
              </div>

              {selectedSpace.owner === mySteamId && (
                <div className="mono-deed-actions">
                  {selectedSpace.type === "property" && selectedSpace.houses < 5 && ownsFullGroup(selectedSpace) && !selectedSpace.mortgaged && (
                    <button className="mono-mini-btn build" disabled={myState.money < selectedSpace.houseCost} onClick={() => buildHouse(selectedSpace.id)}>
                      {selectedSpace.houses === 4 ? t("buildHotel", lang) : t("buildHouse", lang)} · {fmt(selectedSpace.houseCost)}
                    </button>
                  )}
                  {selectedSpace.type === "property" && selectedSpace.houses > 0 && (
                    <button className="mono-mini-btn" onClick={() => sellHouse(selectedSpace.id)}>
                      {t("sellHouse", lang)} · +{fmt(Math.floor(selectedSpace.houseCost / 2))}
                    </button>
                  )}
                  {!selectedSpace.mortgaged && selectedSpace.houses === 0 && (
                    <button className="mono-mini-btn danger" onClick={() => mortgage(selectedSpace.id)}>
                      {t("mortgage", lang)} · +{fmt(Math.floor(selectedSpace.price / 2))}
                    </button>
                  )}
                  {selectedSpace.mortgaged && (
                    <button className="mono-mini-btn" disabled={myState.money < Math.ceil((selectedSpace.price / 2) * 1.1)} onClick={() => unmortgage(selectedSpace.id)}>
                      {t("unmortgage", lang)} · {fmt(Math.ceil((selectedSpace.price / 2) * 1.1))}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= WINNER OVERLAY ================= */}
      <AnimatePresence>
        {gameState.status === "FINISHED" && gameState.winner && (
          <motion.div className="mono-win-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.div className="mono-win-card" initial={{ scale: 0.7, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 14 }}>
              <div className="mono-win-trophy">🏆</div>
              {gameState.winnerTeam != null ? (() => {
                const winners = gameState.players.filter((pid: string) => gameState.playerStates[pid]?.team === gameState.winnerTeam);
                return (
                  <>
                    <div className="mono-win-pawns">
                      {winners.map((pid: string) => <Pawn key={pid} color={gameState.playerStates[pid]?.color || "#ffcc00"} size={56} active />)}
                    </div>
                    <h1>{lang === "fr" ? `L'équipe ${teamLabel(gameState.winnerTeam)} gagne !` : `Team ${teamLabel(gameState.winnerTeam)} wins!`}</h1>
                    <p className="mono-win-team-names">{winners.map((pid: string) => nameOf(pid)).join(" & ")}</p>
                    <p>{t("gameOver", lang)}</p>
                  </>
                );
              })() : (
                <>
                  <Pawn color={gameState.playerStates[gameState.winner]?.color || "#ffcc00"} size={64} active />
                  <h1>{t("winner", lang, { name: nameOf(gameState.winner) })}</h1>
                  <p>{t("gameOver", lang)}</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* hover tooltip */}
      {hoveredSpace && tileEdge(hoveredSpace.id) !== "corner" && (
        <div
          className="mono-tooltip"
          style={{
            left: Math.min(mousePos.x + 16, (typeof window !== "undefined" ? window.innerWidth : 999) - 220),
            top: mousePos.y + 16,
          }}
        >
          <strong>{nameFull(hoveredSpace)}</strong>
          {hoveredSpace.price != null && <span>{fmt(hoveredSpace.price)}</span>}
          {hoveredSpace.owner && <span className="mono-tt-owner">{t("ownedBy", lang, { name: nameOf(hoveredSpace.owner) })}</span>}
        </div>
      )}
    </div>,
    document.body
  );
}
