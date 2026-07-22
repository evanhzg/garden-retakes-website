"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Lang, money, spaceName, spaceShort, GROUP_LABEL, cardTitle, cardBody,
  t, localizeLog, logCategory, UI,
} from "@/components/games/monopolyData";
import "./monopoly.css";

const DiceRoller = dynamic(() => import("./DiceRoller"), { ssr: false });

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

const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000);

// Which inner edge a tile's colour bar / content faces (toward the board centre).
function tileEdge(id: number): "top" | "right" | "bottom" | "left" | "corner" {
  if ([0, 10, 20, 30].includes(id)) return "corner";
  if (id >= 1 && id <= 9) return "top";       // bottom row → bar on top
  if (id >= 11 && id <= 19) return "right";    // left col → bar on right
  if (id >= 21 && id <= 29) return "bottom";   // top row → bar on bottom
  return "left";                               // right col → bar on left
}

const CORNER_ICON: Record<number, string> = { 0: "→", 10: "🔒", 20: "🅿️", 30: "🚓" };

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

  // Card popup shown when the server reports a freshly drawn card.
  const [shownCard, setShownCard] = useState<any>(null);
  const prevDrawIdRef = useRef<string | null>(null);

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
  const endTurn = () => socket?.emit("monopoly_end_turn");
  const payJail = () => socket?.emit("monopoly_pay_jail");
  const useJailCard = () => socket?.emit("monopoly_use_card");
  const buildHouse = (spaceId: number) => socket?.emit("monopoly_build", { spaceId });
  const sellHouse = (spaceId: number) => socket?.emit("monopoly_sell", { spaceId });
  const mortgage = (spaceId: number) => socket?.emit("monopoly_mortgage", { spaceId });
  const unmortgage = (spaceId: number) => socket?.emit("monopoly_unmortgage", { spaceId });
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/"; };

  if (!gameState || gameState.status === "WAITING") return null;

  const isMyTurn = gameState.currentTurn === mySteamId;
  const myState = gameState.playerStates[mySteamId];
  const phase = gameState.turnPhase;
  const currentSpace = myState ? gameState.board[myState.position] : null;
  const canBuyHere =
    currentSpace &&
    ["property", "rail", "util"].includes(currentSpace.type) &&
    currentSpace.owner == null &&
    myState.money >= currentSpace.price;

  const propertyCount = (pid: string) =>
    gameState.board.filter((s: any) => s.owner === pid).length;

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
          <button className="mono-exit" onClick={exitGame} title={lang === "fr" ? "Quitter la partie" : "Leave game"}>✕</button>
        </div>
      </header>

      <div className="mono-stage">
        {/* ================= PLAYER PANEL ================= */}
        <aside className="mono-players-col">
          {gameState.players.map((pid: string) => {
            const s = gameState.playerStates[pid];
            const isTurn = gameState.currentTurn === pid;
            return (
              <motion.div
                layout
                key={pid}
                className={`mono-pcard ${isTurn ? "active" : ""} ${s.bankrupt ? "bankrupt" : ""}`}
                style={{ ["--pc" as any]: s.color }}
                transition={{ type: "spring", stiffness: 200, damping: 24 }}
              >
                <div className="mono-pcard-token">
                  <Pawn color={s.color} size={30} active={isTurn} />
                </div>
                <div className="mono-pcard-body">
                  <div className="mono-pcard-top">
                    <span className="mono-pcard-name">{nameOf(pid)}{pid === mySteamId ? " ★" : ""}</span>
                    {s.jailCards > 0 && <span className="mono-chip">🎟 {s.jailCards}</span>}
                  </div>
                  <div className="mono-pcard-cash">{money(s.money, lang)}</div>
                  <div className="mono-pcard-meta">
                    <span title={t("properties", lang)}>🏠 {propertyCount(pid)}</span>
                    {s.jailed && <span className="mono-jail-tag">⛓ {t("inJail", lang)}</span>}
                    {s.bankrupt && <span className="mono-jail-tag">💀 {t("bankrupt", lang)}</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </aside>

        {/* ================= BOARD ================= */}
        <div className="mono-board-cell">
          <div className="mono-board">
            {gameState.board.map((space: any) => {
              const edge = tileEdge(space.id);
              const playersHere = gameState.players.filter(
                (p: string) => gameState.playerStates[p].position === space.id
              );
              const houses = space.houses || 0;
              const ownerColor = space.owner ? gameState.playerStates[space.owner]?.color : null;
              const clickable = ["property", "rail", "util"].includes(space.type);

              return (
                <div
                  key={space.id}
                  className={`mono-tile s${space.id} edge-${edge} ${space.mortgaged ? "mortgaged" : ""}`}
                  style={ownerColor ? ({ ["--owner" as any]: ownerColor, boxShadow: `inset 0 0 0 2px ${ownerColor}` }) : undefined}
                  onClick={() => clickable && setSelectedSpaceId(space.id)}
                  onMouseEnter={() => setHoveredSpace(space)}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredSpace(null)}
                >
                  {space.group && <div className={`mono-colorbar ${space.group}`} />}

                  {edge === "corner" ? (
                    <div className="mono-tile-corner">
                      <span className="mono-corner-icon">{CORNER_ICON[space.id]}</span>
                      <span className="mono-corner-name">{spaceShort(space.id, lang)}</span>
                    </div>
                  ) : (
                    <div className="mono-tile-content">
                      {space.type === "chance" && <span className="mono-tile-glyph chance">?</span>}
                      {space.type === "chest" && <span className="mono-tile-glyph chest">🧰</span>}
                      {space.type === "tax" && <span className="mono-tile-glyph">💸</span>}
                      {space.type === "rail" && <span className="mono-tile-glyph">🚂</span>}
                      {space.type === "util" && <span className="mono-tile-glyph">{space.id === 12 ? "💡" : "🚰"}</span>}
                      <span className="mono-tile-name">{spaceShort(space.id, lang)}</span>
                      {space.price != null && <span className="mono-tile-price">{money(space.price, lang)}</span>}
                    </div>
                  )}

                  {/* houses / hotel pips on the colour bar */}
                  {houses > 0 && (
                    <div className="mono-buildings">
                      {houses === 5
                        ? <span className="mono-hotel" />
                        : Array.from({ length: houses }).map((_, i) => <span key={i} className="mono-house" />)}
                    </div>
                  )}

                  {/* pawns */}
                  <div className="mono-pawns">
                    <AnimatePresence>
                      {playersHere.map((pid: string, i: number) => (
                        <motion.div
                          key={pid}
                          layoutId={`pawn-${pid}`}
                          className="mono-pawn-wrap"
                          style={{ ["--i" as any]: i }}
                          transition={{ type: "spring", stiffness: 130, damping: 17 }}
                        >
                          <Pawn color={gameState.playerStates[pid].color} size={20} active={gameState.currentTurn === pid} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}

            {/* center hub: dice + branding */}
            <div className="mono-center">
              <div className="mono-center-logo">MONOPOLY</div>
              <div className="mono-dice-zone">
                {gameState.lastRoll && (
                  <DiceRoller
                    lastRoll={gameState.lastRoll}
                    rollKey={rollTriggerKey}
                    onAnimationComplete={() => setIsDiceRolling(false)}
                  />
                )}
              </div>
              {gameState.lastRoll && (
                <div className="mono-roll-readout">
                  {t("rolled", lang, { a: gameState.lastRoll[0], b: gameState.lastRoll[1], t: gameState.lastRoll[0] + gameState.lastRoll[1] })}
                </div>
              )}
            </div>
          </div>
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
                  {localizeLog(l.key, l.params, { lang, nameOf })}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </aside>
      </div>

      {/* ================= ACTION DOCK ================= */}
      <div className="mono-dock">
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
                  💰 {t("buy", lang)} · {spaceShort(currentSpace.id, lang)} · {money(currentSpace.price, lang)}
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
                  🔓 {t("payJail", lang, { amt: money(50, lang) })}
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
                  {GROUP_LABEL[selectedSpace.group]?.[lang] || GROUP_LABEL[selectedSpace.type]?.[lang] || ""}
                </span>
                <span className="mono-deed-name">{spaceName(selectedSpace.id, lang)}</span>
              </div>

              <div className="mono-deed-body">
                {selectedSpace.type === "property" && (
                  <table className="mono-rent-table">
                    <tbody>
                      <tr><td>{t("baseRent", lang)}</td><td>{money(selectedSpace.rent[0], lang)}</td></tr>
                      <tr><td>{t("withSet", lang)}</td><td>{money(selectedSpace.rent[0] * 2, lang)}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 1 })}</td><td>{money(selectedSpace.rent[1], lang)}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 2 })}</td><td>{money(selectedSpace.rent[2], lang)}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 3 })}</td><td>{money(selectedSpace.rent[3], lang)}</td></tr>
                      <tr><td>{t("withHouses", lang, { n: 4 })}</td><td>{money(selectedSpace.rent[4], lang)}</td></tr>
                      <tr className="hotel-row"><td>{t("withHotel", lang)}</td><td>{money(selectedSpace.rent[5], lang)}</td></tr>
                    </tbody>
                  </table>
                )}
                {selectedSpace.type === "rail" && <p className="mono-deed-note">{t("railRent", lang)}</p>}
                {selectedSpace.type === "util" && <p className="mono-deed-note">{t("utilRent", lang)}</p>}

                <div className="mono-deed-facts">
                  {selectedSpace.price != null && <span>{t("price", lang)}: <b>{money(selectedSpace.price, lang)}</b></span>}
                  {selectedSpace.type === "property" && <span>{t("perHouse", lang)}: <b>{money(selectedSpace.houseCost, lang)}</b></span>}
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
                      {selectedSpace.houses === 4 ? t("buildHotel", lang) : t("buildHouse", lang)} · {money(selectedSpace.houseCost, lang)}
                    </button>
                  )}
                  {selectedSpace.type === "property" && selectedSpace.houses > 0 && (
                    <button className="mono-mini-btn" onClick={() => sellHouse(selectedSpace.id)}>
                      {t("sellHouse", lang)} · +{money(Math.floor(selectedSpace.houseCost / 2), lang)}
                    </button>
                  )}
                  {!selectedSpace.mortgaged && selectedSpace.houses === 0 && (
                    <button className="mono-mini-btn danger" onClick={() => mortgage(selectedSpace.id)}>
                      {t("mortgage", lang)} · +{money(Math.floor(selectedSpace.price / 2), lang)}
                    </button>
                  )}
                  {selectedSpace.mortgaged && (
                    <button className="mono-mini-btn" disabled={myState.money < Math.ceil((selectedSpace.price / 2) * 1.1)} onClick={() => unmortgage(selectedSpace.id)}>
                      {t("unmortgage", lang)} · {money(Math.ceil((selectedSpace.price / 2) * 1.1), lang)}
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
              <Pawn color={gameState.playerStates[gameState.winner]?.color || "#ffcc00"} size={64} active />
              <h1>{t("winner", lang, { name: nameOf(gameState.winner) })}</h1>
              <p>{t("gameOver", lang)}</p>
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
          <strong>{spaceName(hoveredSpace.id, lang)}</strong>
          {hoveredSpace.price != null && <span>{money(hoveredSpace.price, lang)}</span>}
          {hoveredSpace.owner && <span className="mono-tt-owner">{t("ownedBy", lang, { name: nameOf(hoveredSpace.owner) })}</span>}
        </div>
      )}
    </div>,
    document.body
  );
}
