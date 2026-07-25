"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor, useGameEvents, useGameChrome, type GameEvent } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import { useGameLang, translator, LangToggle, MEME } from "@/components/games/i18n";
import SoundControls from "@/components/games/sound/SoundControls";
import { sound } from "@/components/games/sound/SoundManager";
import "./shared.css";
import "./meme.css";

type Slot = { x: number; y: number; w: number; dark?: boolean };
type Template = { id: string; name: string; url: string; slots: Slot[]; animated?: boolean };
type Entry = { id?: number; playerId?: string; captions?: string[] | null; gif?: string | null; voteCount?: number; mine?: boolean };

// Curated reaction GIFs for the picker (mirrors scripts/memeContent.js).
const GIF_LIBRARY: { id: string; tags: string; url: string }[] = [
  { id: "clap", tags: "applause clap", url: "https://media.giphy.com/media/7rj2ZgttvgomY/giphy.gif" },
  { id: "facepalm", tags: "facepalm no", url: "https://media.giphy.com/media/6yRVg0HWzgS88/giphy.gif" },
  { id: "shrug", tags: "shrug idk", url: "https://media.giphy.com/media/jS8Fvzd88jNS0/giphy.gif" },
  { id: "mindblown", tags: "mind blown", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif" },
  { id: "crying", tags: "crying sad", url: "https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif" },
  { id: "dance", tags: "dance happy", url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif" },
  { id: "sideye", tags: "side eye suspicious", url: "https://media.giphy.com/media/ZgTR3UQ9Xc6Ba/giphy.gif" },
  { id: "thumbsup", tags: "thumbs up nice", url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif" },
  { id: "confused", tags: "confused math", url: "https://media.giphy.com/media/3o7aTskHEUdgCQAXde/giphy.gif" },
  { id: "popcorn", tags: "popcorn watching", url: "https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif" },
  { id: "nervous", tags: "nervous sweating", url: "https://media.giphy.com/media/Rhhr8D5mccxdK/giphy.gif" },
  { id: "salute", tags: "salute respect", url: "https://media.giphy.com/media/l0HlN5Y28D9MzzcRy/giphy.gif" },
  { id: "cheers", tags: "cheers drink", url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif" },
  { id: "run", tags: "run away", url: "https://media.giphy.com/media/l46Cy1rHbQ92uuLXa/giphy.gif" },
  { id: "no", tags: "no nope", url: "https://media.giphy.com/media/jUwpNzg9IcyrK54/giphy.gif" },
  { id: "yes", tags: "yes success", url: "https://media.giphy.com/media/a0h7sAqON67nO/giphy.gif" },
  { id: "shocked", tags: "shocked gasp", url: "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif" },
  { id: "sleep", tags: "sleep bored tired", url: "https://media.giphy.com/media/QPQ3xlJhqB3Tssdd6G/giphy.gif" },
  { id: "smh", tags: "smh disappointed", url: "https://media.giphy.com/media/vX9WcCiWwUF7G/giphy.gif" },
  { id: "party", tags: "party celebrate", url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif" },
  { id: "typing", tags: "typing waiting", url: "https://media.giphy.com/media/13GIgrGdslD9oQ/giphy.gif" },
  { id: "evil", tags: "evil plotting", url: "https://media.giphy.com/media/dpFj90d7X8Ego/giphy.gif" },
  { id: "cool", tags: "cool sunglasses deal with it", url: "https://media.giphy.com/media/3oEjHUS8sVvhqjNsQE/giphy.gif" },
  { id: "wave", tags: "wave hi bye", url: "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif" },
];

export default function MemeGame() {
  const { socket, steamId } = useSocket();
  const mySteamId = steamId ?? "";

  const [gameState, setGameState] = useState<any>(null);
  const [captions, setCaptions] = useState<string[]>([""]);
  const [focusedSlot, setFocusedSlot] = useState(-1);
  const [gifQuery, setGifQuery] = useState("");
  const [gifUrl, setGifUrl] = useState("");
  const [pickedGif, setPickedGif] = useState<string | null>(null);
  const scoreLenRef = useRef(0);

  const [lang, setLang] = useGameLang(gameState?.lang);
  const t = translator(MEME, lang);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useGameChrome();

  useEffect(() => {
    if (!socket) return;
    const onState = (state: any) => setGameState(state);
    socket.on("meme_state", onState);
    return () => { socket.off("meme_state", onState); };
  }, [socket]);

  // Reset the answer editors at the start of each round.
  const round = gameState?.round;
  const phase = gameState?.phase;
  const slots = gameState?.slots ?? 1;
  const template: Template | null = gameState?.currentTemplate;
  
  useEffect(() => {
    if (phase === "CAPTION") {
      if (template?.slots) {
         setCaptions(template.slots.map((s: any) => ({ text: "", x: s.x, y: s.y, scale: 1, w: s.w })));
      } else {
         setCaptions(new Array(slots).fill({ text: "", x: 50, y: 50, scale: 1, w: 92 }));
      }
      setPickedGif(null);
      setGifUrl("");
      setGifQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase, template?.id]);

  const playerIds: string[] = gameState?.players ?? [];
  const names = usePlayerNames(playerIds);
  const nameOf = useCallback(
    (id: string) => (id === mySteamId ? t("youLabel") : displayNameFor(id, names)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, mySteamId, lang]
  );

  useGameEvents(gameState?.events, (e: GameEvent) => {
    switch (e.type) {
      case "round_start": sound.play("whoosh"); break;
      case "submitted": if (e.pid !== mySteamId) sound.play("submit"); break;
      case "vote_start": sound.play("roundStart"); break;
      case "voted": if (e.pid !== mySteamId) sound.play("voteCast"); break;
      case "results": sound.play(e.pid ? "fanfare" : "roundEnd"); break;
      case "game_over": sound.play("fanfare"); break;
    }
  });

  const ranked = useMemo(() => {
    const scores = gameState?.scores ?? {};
    return [...playerIds].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.scores, playerIds.join(",")]);

  if (!gameState || gameState.status === "WAITING") return null;

  const isGif = gameState.mode === "gif";
  const prompt: string | null = gameState.currentPrompt;
  const isHost = gameState.host === mySteamId;
  const finished = gameState.status === "FINISHED";
  const results: Entry[] = gameState.roundResults ?? [];

  const submitCaption = () => {
    if (isGif) {
      const g = pickedGif || gifUrl.trim();
      if (!g) return;
      sound.play("submit");
      socket?.emit("meme_caption", { gif: g });
    } else {
      if (captions.every((c) => {
         const t = typeof c === "object" && c !== null ? c.text : c;
         return !(t || "").trim();
      })) return;
      sound.play("submit");
      socket?.emit("meme_caption", { captions });
    }
  };
  const nextRound = () => { sound.play("click"); socket?.emit("meme_next_round"); };
  const returnLobby = () => socket?.emit("lobby_return");
  const exitGame = () => { if (typeof window !== "undefined") window.location.href = "/games"; };

  const phaseTotal =
    phase === "CAPTION" ? (gameState.options?.captionSeconds ?? 60)
      : phase === "VOTE" ? (gameState.options?.voteSeconds ?? 30) : 8;
  const timeRatio = Math.max(0, Math.min(1, (gameState.timeLeft ?? 0) / Math.max(1, phaseTotal)));

  const phaseLabel =
    phase === "CAPTION" ? (isGif ? t("phaseGif") : t("phaseCaption"))
      : phase === "VOTE" ? t("phaseVote")
        : t("phaseResults");

  const submittedCount = gameState.submittedPlayers?.length ?? 0;
  const votedCount = gameState.votedPlayers?.length ?? 0;
  const total = playerIds.length;

  const filteredGifs = gifQuery.trim()
    ? GIF_LIBRARY.filter((g) => g.tags.includes(gifQuery.trim().toLowerCase()))
    : GIF_LIBRARY;

  return createPortal(
    <div className="meme-root">
      {/* --------------------------------------------------------- top bar */}
      <header className="meme-topbar">
        <div className="meme-brand-block">
          <span className="meme-brand">HASAMEME</span>
          <span className="meme-round">{t("round", { n: gameState.round, m: gameState.maxRounds })}</span>
        </div>
        <div className="meme-phase-pill">{phaseLabel}</div>
        <div className="meme-top-right">
          {gameState.timeLeft != null && phase !== "RESULTS" && (
            <div className={`meme-timer ${gameState.timeLeft <= 10 ? "warning" : ""}`}>{Math.max(0, gameState.timeLeft)}</div>
          )}
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
          <button className="meme-icon-btn" onClick={exitGame} title={t("leaveGame")} aria-label={t("leaveGame")}>✕</button>
        </div>
      </header>
      {phase !== "RESULTS" && (
        <div className="meme-timebar"><span style={{ transform: `scaleX(${timeRatio})` }} /></div>
      )}

      <div className="meme-stage">
        {/* ===================================================== CAPTION ==== */}
        {phase === "CAPTION" && (
          <AnimatePresence mode="wait">
            {!gameState.hasSubmitted ? (
              <motion.div
                key="compose"
                className="meme-compose"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
              >
                {isGif ? (
                  <>
                    <div className="meme-prompt-card">
                      <span className="meme-prompt-kicker">{t("pickGif")}</span>
                      <h2 className="meme-prompt-text">“{prompt}”</h2>
                    </div>
                    <div className="gif-picker">
                      <div className="gif-picker-controls">
                        <input
                          className="meme-input"
                          value={gifQuery}
                          onChange={(e) => setGifQuery(e.target.value)}
                          placeholder={t("searchGif")}
                        />
                        <input
                          className="meme-input"
                          value={gifUrl}
                          onChange={(e) => { setGifUrl(e.target.value); setPickedGif(null); }}
                          placeholder={t("pasteGifUrl")}
                        />
                      </div>
                      <div className="gif-grid">
                        {filteredGifs.map((g) => (
                          <button
                            key={g.id}
                            className={`gif-cell ${pickedGif === g.url ? "picked" : ""}`}
                            onClick={() => { setPickedGif(g.url); setGifUrl(""); }}
                          >
                            <img src={g.url} alt={g.tags} loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className="meme-primary" onClick={submitCaption} disabled={!pickedGif && !gifUrl.trim()}>
                      {t("submit")} ✓
                    </button>
                  </>
                ) : (
                  <>
                    <div className="meme-canvas-wrap">
                      {template && (
                        <MemeCard
                          template={template}
                          captions={captions}
                          showGuides
                          activeIndex={focusedSlot}
                          guides={captions.map((_, i) => (slots > 1 ? t("captionSlot", { n: i + 1 }) : t("writeCaption")))}
                          onUpdateCaption={(i, up) => {
                             const n = [...captions];
                             n[i] = up;
                             setCaptions(n);
                          }}
                        />
                      )}
                    </div>
                    <div className="meme-caption-fields">
                      {captions.map((c, i) => {
                        const textVal = typeof c === "object" && c !== null ? (c.text ?? "") : c;
                        const fontVal = typeof c === "object" && c !== null ? (c.font || "Impact") : "Impact";
                        const borderVal = typeof c === "object" && c !== null ? (c.border ?? 2) : 2;
                        const colorVal = typeof c === "object" && c !== null ? (c.color || "white") : "white";
                        
                        return (
                        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div className="meme-field-row">
                            {slots > 1 && <span className="meme-field-num">{i + 1}</span>}
                            <input
                              className={`meme-input ${focusedSlot === i ? "focused" : ""}`}
                              value={textVal}
                              maxLength={120}
                              onFocus={() => setFocusedSlot(i)}
                              onBlur={() => setFocusedSlot((cur) => (cur === i ? -1 : cur))}
                              onChange={(e) => { 
                                 const n = [...captions];
                                 if (typeof n[i] === "object" && n[i] !== null) {
                                     n[i] = { ...n[i], text: e.target.value };
                                 } else {
                                     n[i] = e.target.value;
                                 }
                                 setCaptions(n); 
                              }}
                              placeholder={slots > 1 ? t("captionSlot", { n: i + 1 }) : t("writeCaption")}
                            />
                          </div>
                          <div className="meme-controls-row" style={{ paddingLeft: slots > 1 ? "32px" : "0" }}>
                            <select 
                               className="meme-select" 
                               value={fontVal} 
                               onChange={(e) => {
                                 const n = [...captions];
                                 n[i] = { ...(typeof n[i] === "object" ? n[i] : { text: n[i] }), font: e.target.value };
                                 setCaptions(n);
                               }}
                            >
                               <option value="Impact">Impact</option>
                               <option value="Arial">Arial</option>
                               <option value="Courier New">Courier</option>
                               <option value="Comic Sans MS">Comic Sans</option>
                               <option value="Times New Roman">Serif</option>
                            </select>
                            <select 
                               className="meme-select" 
                               value={borderVal} 
                               onChange={(e) => {
                                 const n = [...captions];
                                 n[i] = { ...(typeof n[i] === "object" ? n[i] : { text: n[i] }), border: Number(e.target.value) };
                                 setCaptions(n);
                               }}
                            >
                               <option value={0}>No Border</option>
                               <option value={1}>Thin Border</option>
                               <option value={2}>Normal Border</option>
                               <option value={4}>Thick Border</option>
                               <option value={8}>Huge Border</option>
                            </select>
                            <select 
                               className="meme-select" 
                               value={colorVal} 
                               onChange={(e) => {
                                 const n = [...captions];
                                 n[i] = { ...(typeof n[i] === "object" ? n[i] : { text: n[i] }), color: e.target.value };
                                 setCaptions(n);
                               }}
                            >
                               <option value="white">White</option>
                               <option value="yellow">Yellow</option>
                            </select>
                          </div>
                        </div>
                      )})}
                      <button className="meme-primary" onClick={submitCaption} disabled={captions.every((c) => {
                         const t = typeof c === "object" && c !== null ? c.text : c;
                         return !(t || "").trim();
                      })}>
                        {t("submit")} ✓
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="waiting" className="meme-waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <motion.div className="meme-spinner" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }} />
                <p>{t("submitted")}</p>
                <span className="meme-waiting-count">{t("waitingCount", { n: submittedCount, m: total })}</span>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ======================================================== VOTE ==== */}
        {phase === "VOTE" && (
          <div className="meme-vote-wrap">
            <div className="meme-vote-head">{gameState.hasVoted ? t("voted") : t("tapToVote")}</div>
            {isGif && <div className="meme-prompt-mini">“{prompt}”</div>}
            <div className="meme-gallery">
              {results.map((r, i) => {
                const mine = !!r.mine;
                return (
                  <motion.button
                    key={r.id ?? i}
                    className={`meme-entry ${mine ? "mine" : ""} ${gameState.hasVoted ? "locked" : "votable"}`}
                    disabled={mine || gameState.hasVoted}
                    onClick={() => voteByIndex(i)}
                    initial={{ opacity: 0, scale: 0.85, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 22 }}
                    whileHover={!mine && !gameState.hasVoted ? { scale: 1.03, y: -4 } : undefined}
                  >
                    {isGif
                      ? <img className="meme-entry-gif" src={r.gif || ""} alt="" />
                      : template && <MemeCard template={template} captions={r.captions || []} />}
                    {mine && <span className="meme-yours">{t("yours")}</span>}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================== RESULTS ==== */}
        {phase === "RESULTS" && (
          <div className="meme-results-wrap">
            {finished ? (
              <FinalScores
                ranked={ranked}
                scores={gameState.scores}
                nameOf={nameOf}
                mySteamId={mySteamId}
                t={t}
                isHost={isHost}
                onReturn={returnLobby}
                onLeave={exitGame}
              />
            ) : (
              <>
                {results[0]?.playerId && (
                  <motion.div
                    className="meme-round-winner"
                    initial={{ opacity: 0, scale: 0.7, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 240, damping: 16 }}
                  >
                    👑 {t("roundWinner", { name: nameOf(results[0].playerId!) })}
                  </motion.div>
                )}
                <div className="meme-gallery results">
                  {results.map((r, i) => (
                    <motion.div
                      key={r.id ?? i}
                      className={`meme-entry reveal ${i === 0 && (r.voteCount ?? 0) > 0 ? "winner" : ""}`}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.12 }}
                    >
                      {isGif
                        ? <img className="meme-entry-gif" src={r.gif || ""} alt="" />
                        : template && <MemeCard template={template} captions={r.captions || []} />}
                      <div className="meme-entry-foot">
                        <span className="meme-entry-author">{r.playerId ? nameOf(r.playerId) : "—"}</span>
                        <span className="meme-entry-votes">
                          {"★".repeat(Math.min(5, r.voteCount || 0)) || "·"}
                          <b>{(r.voteCount ?? 0) === 1 ? t("oneVote") : t("votes", { n: r.voteCount ?? 0 })}</b>
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="meme-results-foot">
                  {isHost
                    ? <button className="meme-primary" onClick={nextRound}>{t("nextRound")} ▸</button>
                    : <span className="meme-next-hint">{t("nextIn", { n: Math.max(0, gameState.timeLeft ?? 0) })}</span>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------- scoreboard */}
      <footer className="meme-scorebar">
        {ranked.map((pid) => {
          const acted = phase === "CAPTION"
            ? gameState.submittedPlayers?.includes(pid)
            : phase === "VOTE" ? gameState.votedPlayers?.includes(pid) : false;
          return (
            <motion.div key={pid} layout className={`meme-score-chip ${pid === mySteamId ? "me" : ""} ${acted ? "acted" : ""}`}>
              <span className="meme-score-name">{pid === mySteamId ? t("youLabel") : nameOf(pid)}</span>
              <motion.span
                key={gameState.scores?.[pid]}
                className="meme-score-val"
                initial={{ scale: 1.5, color: "#fde047" }}
                animate={{ scale: 1, color: "#c4b5fd" }}
                transition={{ duration: 0.4 }}
              >
                {gameState.scores?.[pid] ?? 0}
              </motion.span>
              {acted && <span className="meme-score-tick">✓</span>}
            </motion.div>
          );
        })}
      </footer>
    </div>,
    document.body
  );

  // Vote by shuffled index — the server hides authorship during the vote, so we
  // send back the entry position and let it resolve the target.
  function voteByIndex(i: number) {
    if (gameState.hasVoted) return;
    const entry = results[i];
    if (!entry || entry.mine) return;
    sound.play("voteCast");
    socket?.emit("meme_vote", { entryId: entry.id ?? i });
  }
}

function MemeCard({ template, captions, showGuides = false, activeIndex = -1, guides, onUpdateCaption }: {
  template: Template;
  captions: any[];
  showGuides?: boolean;
  activeIndex?: number;
  guides?: string[];
  onUpdateCaption?: (index: number, updates: any) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.PointerEvent, i: number, cap: any, slot: any) => {
    if (!onUpdateCaption || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startCapX = cap.x ?? slot.x;
    const startCapY = cap.y ?? slot.y;

    const onMove = (me: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dxPct = ((me.clientX - startX) / rect.width) * 100;
      const dyPct = ((me.clientY - startY) / rect.height) * 100;
      let newX = Math.max(0, Math.min(100, startCapX + dxPct));
      let newY = Math.max(0, Math.min(100, startCapY + dyPct));
      onUpdateCaption(i, { ...cap, x: newX, y: newY });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const startResize = (e: React.PointerEvent, i: number, cap: any) => {
    if (!onUpdateCaption) return;
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startScale = cap.scale ?? 1;

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX;
      let newScale = startScale + dx * 0.015;
      newScale = Math.max(0.4, Math.min(4, newScale));
      onUpdateCaption(i, { ...cap, scale: newScale });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <div className="meme-card" ref={containerRef}>
      <img className="meme-card-img" src={template.url} alt={template.name} draggable={false} />
      {template.slots.map((slot, i) => {
        const cap = captions[i] || {};
        const text = typeof cap === "string" ? cap : (cap.text ?? "");
        const has = !!text.trim();
        const x = cap.x ?? slot.x;
        const y = cap.y ?? slot.y;
        const scale = cap.scale ?? 1;
        const w = cap.w ?? slot.w;

        if (!has && !showGuides) return null;

        const border = cap.border ?? 2;
        const font = cap.font || "Impact";
        const color = cap.color || "white";
        
        const box: any = { 
          left: `${x}%`, 
          top: `${y}%`, 
          width: `${w}%`, 
          transform: `translate(-50%, -50%) scale(${scale})`,
          fontFamily: font,
          color: color === "yellow" ? "#fde047" : "#fff",
          pointerEvents: showGuides ? ("auto" as any) : "none"
        };
        
        if (border !== 2 || font !== "Impact") {
           box.textShadow = border > 0 ? "0 0 4px rgba(0,0,0,0.6)" : "none";
           if (border > 0) {
             box.WebkitTextStroke = `${border}px #000`;
             // For very thick borders, we need paint-order so the stroke doesn't eat the text inside
             box.paintOrder = "stroke fill";
           } else {
             box.WebkitTextStroke = "0";
           }
        }

        const activeClass = activeIndex === i ? "active" : "";

        return (
          <div
            key={i}
            className={`meme-caption ${!has ? "guide" : ""} ${slot.dark ? "dark" : ""} ${activeClass}`}
            style={box}
            onPointerDown={(e) => showGuides && startDrag(e, i, cap, slot)}
          >
            {has ? text : (guides?.[i] ?? `#${i + 1}`)}
            
            {showGuides && (
               <div 
                 className="meme-resize-handle" 
                 onPointerDown={(e) => startResize(e, i, cap)}
                 title="Drag to resize"
               />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FinalScores({ ranked, scores, nameOf, mySteamId, t, isHost, onReturn, onLeave }: {
  ranked: string[];
  scores: Record<string, number>;
  nameOf: (id: string) => string;
  mySteamId: string;
  t: (k: any, p?: any) => string;
  isHost: boolean;
  onReturn: () => void;
  onLeave: () => void;
}) {
  return (
    <motion.div className="meme-final" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      <h1 className="meme-final-title">{t("gameOver")}</h1>
      {ranked[0] && (
        <motion.div className="meme-final-winner" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.15 }}>
          🏆 {t("winner", { name: ranked[0] === mySteamId ? t("youLabel") : nameOf(ranked[0]) })}
        </motion.div>
      )}
      <div className="meme-final-list">
        {ranked.map((pid, i) => (
          <motion.div key={pid} className="meme-final-row" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
            <span>{i + 1}. {pid === mySteamId ? t("youLabel") : nameOf(pid)}</span>
            <span className="pts">{scores[pid] ?? 0} {t("points")}</span>
          </motion.div>
        ))}
      </div>
      {isHost
        ? <button className="meme-primary" onClick={onReturn}>{t("returnLobby")}</button>
        : <button className="meme-primary" onClick={onLeave}>{t("leaveGame")}</button>}
    </motion.div>
  );
}
