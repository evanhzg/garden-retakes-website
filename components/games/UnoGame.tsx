"use client";

import React, { useState, useEffect, useRef, useReducer, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import { useGameLang, translator, LangToggle, OUNO } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import "./shared.css";
import "./uno.css";

type Pt = { x: number; y: number };
type Card = { id: string; color: string; value: string; declaredColor?: string };

const COLORS = ["red", "yellow", "green", "blue"] as const;
const DRAW_VALUES = ["+2", "+4", "+6"];

/** How each value is drawn on a card face. */
const FACE: Record<string, { glyph: string; corner: string; pie?: boolean; label?: string }> = {
  skip: { glyph: "⊘", corner: "⊘" },
  reverse: { glyph: "⇄", corner: "⇄" },
  "+2": { glyph: "+2", corner: "+2" },
  "+4": { glyph: "+4", corner: "+4", pie: true },
  "+6": { glyph: "+6", corner: "+6" },
  color_picker: { glyph: "", corner: "✦", pie: true, label: "lblWild" },
  swap: { glyph: "⇆", corner: "⇆", pie: true, label: "lblSwap" },
  shuffle: { glyph: "⤨", corner: "⤨", pie: true, label: "lblMix" },
  skip_all: { glyph: "⊘", corner: "⊘", label: "lblAll" },
  discard_all: { glyph: "⇩", corner: "⇩", label: "lblAll" },
};

const CARD_NAME_KEY: Record<string, string> = {
  skip: "cardSkip", reverse: "cardReverse", "+2": "cardDraw2", "+4": "cardDraw4",
  "+6": "cardDraw6", color_picker: "cardWild", skip_all: "cardSkipAll",
  discard_all: "cardDiscardAll", swap: "cardSwap", shuffle: "cardShuffle",
};

const cssColor = (c: string) =>
  c === "red" ? "#ff3b46" : c === "yellow" ? "#ffc300" : c === "green" ? "#2fbf4b" : c === "blue" ? "#2f6bff" : "#16161f";

/** Stable pseudo-random tilt so a card always settles the same way. */
function tiltOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 17) - 8) * 0.9;
}

const centerOf = (el: Element | null | undefined): Pt | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export default function UnoGame() {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";

  const [gameState, setGameState] = useState<any>(null);
  const [pending, setPending] = useState<
    { card: Card; stage: "color" | "target"; declaredColor?: string | null; needsTarget: boolean } | null
  >(null);
  const [pile, setPile] = useState<Card[]>([]);
  const [feed, setFeed] = useState<{ id: number; text: string; tone?: string }[]>([]);
  const [pops, setPops] = useState<{ id: number; pid: string; text: string }[]>([]);
  const [flash, setFlash] = useState(0);
  const [viewport, setViewport] = useState({ w: 1280, h: 720 });
  const [metrics, setMetrics] = useState({ cardW: 124, cardH: 182, overlap: 22 });
  const [, retick] = useReducer((x: number) => x + 1, 0);

  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(OUNO, lang);

  // Measured anchors, in viewport coordinates.
  const anchors = useRef<{ deck: Pt | null; discard: Pt | null; hand: Pt | null; seats: Record<string, Pt> }>({
    deck: null, discard: null, hand: null, seats: {},
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const discardRef = useRef<HTMLDivElement | null>(null);
  const handAnchorRef = useRef<HTMLDivElement | null>(null);
  const seatRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const prevHandLen = useRef(0);
  const wasMyTurn = useRef(false);
  const myWindow = useRef<{ start: number; total: number } | null>(null);
  const catchClocks = useRef<Record<string, { start: number; total: number }>>({});
  const lastTickSecond = useRef(-1);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  // Reserve the site header's height so it sits above the board, not over it.
  useGameChrome();

  useEffect(() => {
    if (!socket) return;
    const onState = (state: any) => {
      setGameState(state);
      // The server resolved the wild, so any half-finished picker is stale.
      if (state.currentTurn !== mySteamId) setPending(null);
    };
    socket.on("uno_state", onState);
    return () => { socket.off("uno_state", onState); };
  }, [socket, mySteamId]);

  // --- geometry ------------------------------------------------------------
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The card sizes live in CSS media queries; read them back so the fan maths
  // and the flight origins stay in step with whatever breakpoint is active.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const px = (v: string, fallback: number) => parseFloat(cs.getPropertyValue(v)) || fallback;
    const next = {
      cardW: px("--card-width", 124),
      cardH: px("--card-height", 182),
      overlap: px("--opp-overlap", 22),
    };
    setMetrics((prev) =>
      prev.cardW === next.cardW && prev.cardH === next.cardH && prev.overlap === next.overlap ? prev : next
    );
  });

  // Re-measure after every state push; positions feed the flight animations.
  useEffect(() => {
    const seats: Record<string, Pt> = {};
    for (const [pid, el] of Object.entries(seatRefs.current)) {
      const c = centerOf(el);
      if (c) seats[pid] = c;
    }
    anchors.current = {
      deck: centerOf(deckRef.current) ?? anchors.current.deck,
      discard: centerOf(discardRef.current) ?? anchors.current.discard,
      hand: centerOf(handAnchorRef.current) ?? anchors.current.hand,
      seats,
    };
  });

  // --- names ---------------------------------------------------------------
  const tableIds: string[] = gameState?.players ?? [];
  const names = usePlayerNames(tableIds);
  const nameOf = useCallback(
    (id: string) => (id === mySteamId ? t("youLabel") : displayNameFor(id, names)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, mySteamId, lang]
  );

  // --- discard pile memory -------------------------------------------------
  const topId = gameState?.topCard?.id;
  useEffect(() => {
    const tc = gameState?.topCard;
    if (!tc) { setPile([]); return; }
    setPile((prev) => (prev[prev.length - 1]?.id === tc.id ? prev : [...prev, tc].slice(-4)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topId]);

  // --- OUNO window clocks --------------------------------------------------
  const windowMs = gameState?.unoWindowMs ?? null;
  useEffect(() => {
    if (windowMs == null || windowMs < 0) { myWindow.current = null; lastTickSecond.current = -1; return; }
    myWindow.current = { start: Date.now(), total: windowMs };
  }, [windowMs, gameState?.calledUno]);

  useEffect(() => {
    const opp = gameState?.opponents ?? {};
    const next: Record<string, { start: number; total: number }> = {};
    for (const [pid, d] of Object.entries<any>(opp)) {
      if (d.catchableFor == null || d.catchableFor < 0) continue;
      next[pid] = { start: Date.now(), total: d.catchableFor };
    }
    catchClocks.current = next;
  }, [gameState?.opponents]);

  // Drive the draining bars locally between server pushes.
  const hasOwnWindow = windowMs != null && windowMs >= 0 && !gameState?.calledUno;
  const hasCatchable = Object.values<any>(gameState?.opponents ?? {})
    .some((d) => d.catchableFor != null && d.catchableFor >= 0);
  useEffect(() => {
    if (!hasOwnWindow && !hasCatchable) return;
    const id = setInterval(retick, 90);
    return () => clearInterval(id);
  }, [hasOwnWindow, hasCatchable]);

  const myWindowLeft = (() => {
    if (windowMs == null) return null;
    if (windowMs < 0) return -1;
    const w = myWindow.current;
    if (!w) return windowMs;
    return Math.max(0, w.total - (Date.now() - w.start));
  })();

  // Audible countdown as your own window drains.
  useEffect(() => {
    if (myWindowLeft == null || myWindowLeft < 0 || gameState?.calledUno) { lastTickSecond.current = -1; return; }
    const sec = Math.ceil(myWindowLeft / 1000);
    if (sec <= 3 && sec >= 1 && sec !== lastTickSecond.current) {
      lastTickSecond.current = sec;
      sound.play("tick");
    }
  }, [myWindowLeft, gameState?.calledUno]);

  // --- events -> sound, feed, popups ---------------------------------------
  const pushFeed = useCallback((id: number, text: string, tone?: string) => {
    setFeed((f) => [...f.slice(-4), { id, text, tone }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 5200);
  }, []);

  const pushPop = useCallback((id: number, pid: string, text: string) => {
    setPops((p) => [...p, { id, pid, text }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1500);
  }, []);

  const cardLabel = useCallback(
    (value: string, color?: string) => {
      const key = CARD_NAME_KEY[value];
      const base = key ? t(key as any) : value;
      if (!color || color === "wild" || key) return base;
      return `${t(color as any)} ${base}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang]
  );

  useGameEvents(gameState?.events, (e: GameEvent) => {
    const who = e.pid ? nameOf(e.pid) : "";
    const other = e.byPid ? nameOf(e.byPid) : e.targetPid ? nameOf(e.targetPid) : "";
    const mine = e.pid === mySteamId;

    switch (e.type) {
      case "deal":
        sound.play("cardDeal");
        break;
      case "play": {
        sound.play("cardPlay");
        if (e.color && DRAW_VALUES.includes(e.value)) sound.play("stack");
        pushFeed(e.seq, t(e.jumpIn ? "evJumpIn" : "evPlay", { name: who, card: cardLabel(e.value, e.color) }));
        break;
      }
      case "draw":
        sound.play("cardDraw");
        pushFeed(e.seq, t("evDraw", { name: who, n: e.count }));
        break;
      case "penalty_draw":
        sound.play("penalty");
        pushPop(e.seq, e.pid, `+${e.count}`);
        if (mine) setFlash(Date.now());
        pushFeed(e.seq, t("evPenalty", { name: who, n: e.count }), "bad");
        break;
      case "skip":
        sound.play("skipTurn");
        pushFeed(e.seq, t("evSkip", { name: who }));
        break;
      case "skip_all":
        sound.play("skipTurn");
        pushFeed(e.seq, t("evSkipAll"), "hot");
        break;
      case "reverse":
        sound.play("reverse");
        pushFeed(e.seq, t("evReverse"));
        break;
      case "stack":
        sound.play("stack");
        pushFeed(e.seq, t("evStack", { n: e.total }), "hot");
        break;
      case "swap":
        sound.play("swap");
        pushFeed(e.seq, t("evSwap", { name: who, other }), "hot");
        break;
      case "shuffle_hands":
        sound.play("shuffle");
        pushFeed(e.seq, t("evShuffle", { name: who }), "hot");
        break;
      case "rotate_hands":
        sound.play("swap");
        pushFeed(e.seq, t("evRotate"), "hot");
        break;
      case "discard_all":
        sound.play("shuffle");
        pushFeed(e.seq, t("evDiscardAll", { name: who, n: e.count }), "hot");
        break;
      case "reshuffle":
        sound.play("shuffle");
        pushFeed(e.seq, t("evReshuffle"));
        break;
      case "uno_called":
        sound.play("unoCall");
        pushFeed(e.seq, t("evCalled", { name: who }), "hot");
        break;
      case "uno_forgot":
        sound.play("caught");
        pushPop(e.seq, e.pid, `+${e.amount}`);
        if (mine) setFlash(Date.now());
        pushFeed(e.seq, t("evForgot", { name: who, n: e.amount }), "bad");
        break;
      case "uno_caught":
        sound.play("caught");
        pushPop(e.seq, e.pid, `+${e.amount}`);
        if (mine) setFlash(Date.now());
        pushFeed(e.seq, t("evCaught", { name: other, other: who, n: e.amount }), "bad");
        break;
      case "uno_false_call":
        sound.play("error");
        pushPop(e.seq, e.pid, `+${e.amount}`);
        if (mine) setFlash(Date.now());
        pushFeed(e.seq, t("evFalseCall", { name: who, n: e.amount }), "bad");
        break;
      case "uno_false_catch":
        sound.play("error");
        pushPop(e.seq, e.pid, `+${e.amount}`);
        if (mine) setFlash(Date.now());
        pushFeed(e.seq, t("evFalseCatch", { name: who, n: e.amount }), "bad");
        break;
      case "challenge_won":
        sound.play("correct");
        pushFeed(e.seq, t("evChallengeWon", { other, n: e.amount }), "good");
        break;
      case "challenge_lost":
        sound.play("caught");
        if (mine) setFlash(Date.now());
        pushFeed(e.seq, t("evChallengeLost", { name: who, n: e.amount }), "bad");
        break;
      case "win":
        sound.play("win");
        pushFeed(e.seq, t("evWin", { name: who }), "good");
        break;
    }
  });

  // Chime when the turn lands on you.
  const isMyTurn = gameState?.currentTurn === mySteamId;
  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current && gameState?.status === "PLAYING") sound.play("turnAlert");
    wasMyTurn.current = !!isMyTurn;
  }, [isMyTurn, gameState?.status]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(0), 520);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    prevHandLen.current = gameState?.hand?.length ?? 0;
  });

  if (!gameState || gameState.status === "WAITING") return null;

  const rules = gameState.rules ?? {};
  const hand: Card[] = gameState.hand ?? [];
  const topCard: Card | null = gameState.topCard ?? null;
  const opponents: [string, any][] = Object.entries(gameState.opponents ?? {});

  // --- rules --------------------------------------------------------------
  const answersPenalty = (card: Card) => {
    if (!rules.stacking || !DRAW_VALUES.includes(card.value)) return false;
    return rules.stackAnyDraw || card.value === topCard?.value;
  };
  const matches = (card: Card) =>
    card.color === "wild" || card.color === gameState.currentColor || card.value === topCard?.value;
  const isPlayable = (card: Card) => (gameState.drawPenalty > 0 ? answersPenalty(card) : matches(card));
  const isJumpable = (card: Card) =>
    !!rules.jumpIn && !isMyTurn && gameState.drawPenalty === 0 &&
    card.color !== "wild" && !!topCard && card.color === topCard.color && card.value === topCard.value;

  const canAct = isMyTurn && gameState.status === "PLAYING";
  const hasPlayable = hand.some(isPlayable);
  const canDraw = canAct && !gameState.hasDrawnThisTurn && !(rules.forcePlay && gameState.drawPenalty === 0 && hasPlayable);

  // --- animation origins ---------------------------------------------------
  const a = anchors.current;
  const deckToHand: Pt = a.deck && a.hand ? { x: a.deck.x - a.hand.x, y: a.deck.y - a.hand.y } : { x: 0, y: -220 };
  const handToDiscard: Pt = a.hand && a.discard ? { x: a.discard.x - a.hand.x, y: a.discard.y - a.hand.y } : { x: 0, y: -220 };
  // Where a freshly-played card should fly in from: the seat that played it,
  // falling back to the deck for the opening card.
  const discardOrigin = (pid?: string): Pt => {
    if (!a.discard) return { x: 0, y: 120 };
    const src = (pid ? (pid === mySteamId ? a.hand : a.seats[pid]) : null) ?? a.deck;
    if (!src) return { x: 0, y: 120 };
    return { x: src.x - a.discard.x, y: src.y - a.discard.y };
  };

  // --- actions -------------------------------------------------------------
  const emitPlay = (card: Card, declaredColor?: string | null, targetId?: string | null) => {
    socket?.emit("uno_play", { cardId: card.id, declaredColor, targetId });
  };

  const beginPlay = (card: Card) => {
    if (gameState.status !== "PLAYING") return;
    const playable = isPlayable(card);
    const jumpable = isJumpable(card);
    if (!jumpable && (!canAct || !playable)) { sound.play("error"); return; }

    const needsColor = card.color === "wild";
    const needsTarget = card.value === "swap" || (card.value === "7" && !!rules.sevenZero);
    if (needsColor) { sound.play("click"); setPending({ card, stage: "color", needsTarget }); return; }
    if (needsTarget) { sound.play("click"); setPending({ card, stage: "target", declaredColor: null, needsTarget }); return; }
    emitPlay(card);
  };

  const chooseColor = (color: string) => {
    if (!pending) return;
    sound.play("wild");
    if (pending.needsTarget) setPending({ ...pending, declaredColor: color, stage: "target" });
    else { emitPlay(pending.card, color); setPending(null); }
  };

  const chooseTarget = (pid: string) => {
    if (!pending) return;
    sound.play("swap");
    emitPlay(pending.card, pending.declaredColor ?? null, pid);
    setPending(null);
  };

  const drawCard = () => { if (canDraw) { sound.play("click"); socket?.emit("uno_draw"); } };
  const passTurn = () => { sound.play("click"); socket?.emit("uno_pass_turn"); };
  const callOuno = () => socket?.emit("uno_call_uno");
  const catchOuno = (pid: string) => socket?.emit("uno_catch_uno", { targetId: pid });
  const challenge = () => { sound.play("click"); socket?.emit("uno_challenge"); };
  const returnLobby = () => socket?.emit("lobby_return");
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/games"; };

  // --- seats ---------------------------------------------------------------
  const seatPosition = (pid: string) => {
    const others = tableIds.filter((id) => id !== mySteamId);
    const n = others.length;
    if (n === 0) return { style: {}, counterRotate: 0 };
    const i = others.indexOf(pid);
    let angleDeg = 90;
    if (n === 2) angleDeg = i === 0 ? 180 : 0;
    else if (n === 3) angleDeg = i === 0 ? 180 : i === 1 ? 90 : 0;
    else if (n > 3) angleDeg = 180 - (i / (n - 1)) * 180;

    const rad = (angleDeg * Math.PI) / 180;
    const leftPct = 50 + Math.cos(rad) * 42;
    const topPct = 42 - Math.sin(rad) * 33;
    const rotation = 270 - angleDeg;

    // Percentages resolve against the board (which is inset below the header),
    // so seats stay inside the play area rather than the whole viewport.
    return {
      style: {
        left: `clamp(min(170px, 23vw), ${leftPct}%, calc(100% - min(170px, 23vw)))`,
        top: `clamp(min(130px, 18%), ${topPct}%, calc(100% - min(280px, 44%)))`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      } as React.CSSProperties,
      counterRotate: -rotation,
    };
  };

  // --- my hand fan ---------------------------------------------------------
  const n = hand.length;
  const mid = (n - 1) / 2;
  const maxSpan = Math.min(viewport.w * 0.92, 1180) - metrics.cardW;
  const step = n > 1 ? Math.min(metrics.cardW * 0.62, maxSpan / (n - 1)) : 0;
  const perCard = Math.min(6, 84 / Math.max(n, 8));
  const newCards = Math.max(0, n - prevHandLen.current);

  const handLayout = (i: number) => {
    const off = i - mid;
    return {
      x: off * step,
      y: Math.pow(Math.abs(off), 1.7) * 1.15,
      rotate: off * perCard,
    };
  };

  const activeColor = cssColor(gameState.currentColor);
  const ounoOpen = myWindowLeft != null && !gameState.calledUno;
  const windowRatio = myWindowLeft == null || myWindowLeft < 0 || !myWindow.current
    ? 1
    : Math.max(0, Math.min(1, myWindowLeft / myWindow.current.total));

  return createPortal(
    <div className="uno-container" ref={containerRef}>
      <div className="uno-board">

        {/* ---------------------------------------------------------- topbar */}
        <div className="uno-topbar">
          <span className="uno-brand">OUNO</span>
          <div className="uno-rule-chips">
            {rules.stacking && <span className="uno-chip">{t("ruleStacking")}</span>}
            {rules.jumpIn && <span className="uno-chip">{t("ruleJumpIn")}</span>}
            {rules.sevenZero && <span className="uno-chip">{t("ruleSevenZero")}</span>}
            {rules.drawToMatch && <span className="uno-chip">{t("ruleDrawToMatch")}</span>}
            {rules.forcePlay && <span className="uno-chip">{t("ruleForcePlay")}</span>}
            {rules.challengeDrawFour && <span className="uno-chip">{t("ruleChallenge")}</span>}
            <span className="uno-chip hot">
              {t("ruleCallWindow")} {t("ruleSeconds", { n: Math.round((rules.callWindowMs ?? 5000) / 100) / 10 })} · +{rules.forgotPenalty}
            </span>
          </div>
          <div className="uno-topbar-spacer" />
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
          <button className="uno-icon-btn" onClick={exitGame} title={t("leaveGame")} aria-label={t("leaveGame")}>✕</button>
        </div>

        {/* --------------------------------------------------------- opponents */}
        {opponents.map(([pid, data]) => {
          const pos = seatPosition(pid);
          const isTheirTurn = gameState.currentTurn === pid;
          const count = data.count || 0;
          const catchable = data.catchableFor != null;
          const clock = catchClocks.current[pid];
          const catchRatio = data.catchableFor === -1 || !clock
            ? 1
            : Math.max(0, Math.min(1, (clock.total - (Date.now() - clock.start)) / Math.max(1, clock.total)));
          const fanSpread = Math.min(5, 70 / Math.max(count, 10));
          const oppName = nameOf(pid);

          return (
            <div key={pid} className={`opponent-container ${isTheirTurn ? "active-turn" : ""}`} style={pos.style}>
              <div className="opponent-info" style={{ transform: `rotate(${pos.counterRotate}deg)` }}>
                <div className="opponent-avatar" title={oppName}>
                  {names[pid]?.avatar
                    ? <img src={names[pid].avatar as string} alt="" />
                    : oppName.slice(0, 2).toUpperCase()}
                  {isTheirTurn && <span className="turn-ring" />}
                </div>
                <span className="opponent-name">{oppName}</span>
                <span className={`opponent-count ${count === 1 ? "low" : ""}`}>
                  {count === 1 ? t("oneCard") : t("cards", { n: count })}
                </span>

                {data.calledUno && <span className="uno-flag">OUNO!</span>}

                <AnimatePresence>
                  {catchable && !data.calledUno && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                    >
                      <button
                        className="catch-btn"
                        onClick={() => catchOuno(pid)}
                        title={t("catchTitle", { name: oppName })}
                      >
                        {t("catchThem")}
                        <span className="catch-timer" style={{ transform: `scaleX(${catchRatio})` }} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {pops.filter((p) => p.pid === pid).map((p) => (
                    <motion.span
                      key={p.id}
                      className="penalty-pop"
                      initial={{ opacity: 0, x: "-50%", y: 0, scale: 0.6 }}
                      animate={{ opacity: 1, x: "-50%", y: -46, scale: 1.15 }}
                      exit={{ opacity: 0, x: "-50%", y: -70 }}
                      transition={{ duration: 0.5 }}
                    >
                      {p.text}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>

              <div
                className="opponent-fan"
                ref={(el) => { seatRefs.current[pid] = el; }}
                style={{ width: metrics.cardW + Math.max(0, count - 1) * metrics.overlap }}
              >
                <AnimatePresence initial={false}>
                  {Array.from({ length: count }).map((_, i) => {
                    const off = i - (count - 1) / 2;
                    return (
                      <motion.div
                        key={`${pid}-${i}`}
                        style={{ position: "absolute", left: 0, top: 0, zIndex: i }}
                        initial={{ opacity: 0, scale: 0.65, x: i * metrics.overlap, y: -38, rotate: 0 }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          x: i * metrics.overlap,
                          y: Math.pow(Math.abs(off), 1.7) * 0.8,
                          rotate: off * fanSpread,
                        }}
                        exit={{ opacity: 0, scale: 0.8, y: -80, transition: { duration: 0.25, ease: "easeIn" } }}
                        transition={{ type: "spring", stiffness: 320, damping: 30 }}
                      >
                        <UnoCardBack />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          );
        })}

        {/* ------------------------------------------------------------ table */}
        <div className="uno-center">
          <div className={`uno-direction ${gameState.direction === -1 ? "ccw" : ""}`} />

          <div
            ref={deckRef}
            className={`deck ${canDraw ? "can-draw" : ""} ${canDraw && !hasPlayable ? "deck-glow" : ""}`}
            onClick={drawCard}
            title={t("drawCard")}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="deck-stack-card" style={{ transform: `translate(${-i * 3}px, ${-i * 3}px)` }}>
                {i === 2 && <div className="card-back-face"><span className="logo">OUNO</span></div>}
              </div>
            ))}
            <span className="deck-count">{t("deckLeft", { n: gameState.deckCount ?? 0 })}</span>
          </div>

          <div ref={discardRef} className="discard">
            <div className="discard-well" />
            <div className="discard-slot">
              {pile.map((card, i) => {
                const isTop = i === pile.length - 1;
                const settle = tiltOf(card.id);
                if (!isTop) {
                  return (
                    <div key={card.id} style={{ transform: `rotate(${settle}deg)`, opacity: 0.85 }}>
                      <UnoCard card={card} t={t} />
                    </div>
                  );
                }
                const origin = discardOrigin(gameState.lastPlay?.pid);
                return (
                  <motion.div
                    key={card.id}
                    initial={{ x: origin.x, y: origin.y, rotate: settle - 34, scale: 0.86, opacity: 0.2 }}
                    animate={{ x: 0, y: 0, rotate: settle, scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 230, damping: 24, mass: 0.7 }}
                  >
                    <UnoCard card={card} t={t} />
                  </motion.div>
                );
              })}
            </div>

            <AnimatePresence>
              {gameState.drawPenalty > 0 && (
                <motion.div
                  className="stack-badge"
                  key="stack"
                  initial={{ opacity: 0, x: "-50%", y: 10, scale: 0.7 }}
                  animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: "-50%", scale: 0.7 }}
                >
                  {t("drawStack", { n: gameState.drawPenalty })}
                </motion.div>
              )}
            </AnimatePresence>

            {gameState.currentColor && (
              <div
                className="color-orb"
                style={{ background: activeColor, boxShadow: `0 0 18px 3px ${activeColor}` }}
                title={t(gameState.currentColor)}
              />
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- feed */}
        <div className="uno-feed">
          <AnimatePresence initial={false}>
            {feed.map((line) => (
              <motion.div
                key={line.id}
                className={`feed-line ${line.tone ?? ""}`}
                initial={{ opacity: 0, x: -22, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, x: -22, height: 0 }}
                transition={{ duration: 0.22 }}
              >
                {line.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* -------------------------------------------------------------- dock */}
        <div className="player-dock">
          <div className="dock-actions">
            <AnimatePresence mode="wait">
              {canAct ? (
                <motion.span key="turn" className="turn-banner"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
                  ▶ {t("yourTurn")}
                </motion.span>
              ) : (
                <motion.span key="wait" className="turn-banner waiting"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
                  {gameState.currentTurn ? t("turnOf", { name: nameOf(gameState.currentTurn) }) : t("waiting")}
                </motion.span>
              )}
            </AnimatePresence>

            {canAct && gameState.canChallenge && (
              <motion.div className="challenge-card" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}>
                <button onClick={challenge}>⚖ {t("challenge")}</button>
                <small>{t("challengeHint", { n: gameState.drawPenalty + 2 })}</small>
              </motion.div>
            )}

            {canAct && gameState.hasDrawnThisTurn && (
              <button className="dock-btn" onClick={passTurn}>{t("passTurn")}</button>
            )}

            {canAct && gameState.drawPenalty > 0 && (
              <button className="dock-btn danger" onClick={drawCard}>
                {t("mustAnswer", { n: gameState.drawPenalty })}
              </button>
            )}

            <AnimatePresence>
              {ounoOpen && (
                <motion.div
                  key="ouno"
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                >
                  <button
                    className={`ouno-btn ${windowRatio < 0.35 ? "urgent" : ""}`}
                    onClick={callOuno}
                    title={t("callNow")}
                  >
                    {t("callOuno")}
                    <span className="window-bar" style={{ transform: `scaleX(${windowRatio})` }} />
                  </button>
                </motion.div>
              )}
              {gameState.calledUno && (
                <motion.span key="called" className="called-flag"
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  ★ {t("ounoCalled")}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="player-hand">
            <div ref={handAnchorRef} className="hand-anchor" />
            <AnimatePresence initial={false}>
              {hand.map((card, i) => {
                const layout = handLayout(i);
                const playable = canAct && isPlayable(card);
                const jumpable = isJumpable(card);
                const dimmed = canAct && !playable;
                const isNew = i >= n - newCards;
                const delay = isNew ? Math.min(0.5, (i - (n - newCards)) * 0.06) : 0;

                return (
                  <motion.div
                    key={card.id}
                    className={`hand-card ${playable || jumpable ? "" : "locked"}`}
                    style={{ ["--z" as any]: i + 1, marginLeft: -metrics.cardW / 2 }}
                    initial={{ x: deckToHand.x, y: deckToHand.y, rotate: 34, scale: 0.7, opacity: 0 }}
                    animate={{ ...layout, scale: 1, opacity: 1 }}
                    exit={{
                      x: handToDiscard.x, y: handToDiscard.y, rotate: 0, scale: 1, opacity: 0,
                      transition: { duration: 0.26, ease: "easeIn" },
                    }}
                    whileHover={
                      playable || jumpable
                        ? { y: layout.y - 46, scale: 1.09, rotate: layout.rotate * 0.35 }
                        : { y: layout.y - 16 }
                    }
                    transition={{ type: "spring", stiffness: 300, damping: 28, delay }}
                    onClick={() => beginPlay(card)}
                  >
                    <UnoCard
                      card={card}
                      t={t}
                      state={jumpable ? "jumpable" : playable ? "playable" : dimmed ? "dimmed" : ""}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* ------------------------------------------------------------ flash */}
        <AnimatePresence>
          {flash > 0 && (
            <motion.div className="uno-flash" key={flash}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
          )}
        </AnimatePresence>

        {/* ----------------------------------------------------------- modals */}
        <AnimatePresence>
          {pending?.stage === "color" && (
            <motion.div className="uno-modal-backdrop" key="colors"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPending(null); }}>
              <motion.div className="uno-modal"
                initial={{ scale: 0.85, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}>
                <h2>{t("chooseColor")}</h2>
                <div className="color-grid">
                  {COLORS.map((c) => (
                    <button key={c} className={`color-btn ${c}`} onClick={() => chooseColor(c)} title={t(c)} aria-label={t(c)} />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {pending?.stage === "target" && (
            <motion.div className="uno-modal-backdrop" key="target"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setPending(null); }}>
              <motion.div className="uno-modal"
                initial={{ scale: 0.85, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}>
                <h2>{t("swapWith")}</h2>
                <div className="target-list">
                  {tableIds.filter((p) => p !== mySteamId).map((p) => (
                    <button key={p} className="target-btn" onClick={() => chooseTarget(p)}>
                      <span>{nameOf(p)}</span>
                      <span className="n">{t("cards", { n: gameState.opponents?.[p]?.count ?? 0 })}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {gameState.status === "FINISHED" && (
            <motion.div className="uno-modal-backdrop" key="win"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="uno-modal"
                initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 20 }}>
                <h1 className="win-title">{t("gameOver")}</h1>
                <p style={{ fontSize: "1.15rem", margin: 0 }}>
                  {gameState.winner === mySteamId ? t("youWon") : t("someoneWon", { name: nameOf(gameState.winner) })}
                </p>
                {tableIds[0] === mySteamId ? (
                  <button onClick={returnLobby} className="btn-start-game">{t("returnLobby")}</button>
                ) : (
                  <button onClick={exitGame} className="btn-start-game">{t("leaveGame")}</button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Card faces
// ---------------------------------------------------------------------------
function UnoCard({ card, state = "", t }: {
  card: Card;
  state?: string;
  t: (k: any, p?: any) => string;
}) {
  const face = FACE[card.value];
  const isWild = card.color === "wild";
  const corner = face?.corner ?? card.value;
  const glyph = face?.glyph ?? card.value;
  const label = face?.label ? t(face.label) : null;
  const nameKey = CARD_NAME_KEY[card.value];
  const title = nameKey ? t(nameKey) : card.value;

  return (
    <div className={`uno-card ${card.color} ${state}`} title={title}>
      <span className="corner tl">{corner}</span>
      <div className="inner-oval">
        {face?.pie && <div className={`wild-pie ${glyph ? "small" : ""}`} />}
        {glyph && (
          <span className="value-center" style={face?.pie ? { position: "absolute", color: "#fff", textShadow: "0 2px 7px rgba(0,0,0,0.85)" } : undefined}>
            {glyph}
          </span>
        )}
      </div>
      {label && <span className="wild-label">{label}</span>}
      <span className="corner br">{corner}</span>
    </div>
  );
}

function UnoCardBack() {
  return (
    <div className="uno-card back">
      <div className="card-back-face"><span className="logo">OUNO</span></div>
    </div>
  );
}
