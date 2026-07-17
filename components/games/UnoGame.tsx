"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import "./uno.css";

export default function UnoGame() {
  const { socket, isConnected, steamId } = useSocket();
  const mySteamId = steamId ?? "";
  const [gameState, setGameState] = useState<any>(null);
  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [showTargetPicker, setShowTargetPicker] = useState<string | null>(null);
  const [modifiers, setModifiers] = useState({
    stacking: true,
    sevenZero: false,
    jumpIn: true,
    team2v2: false,
    playOnDraw: true
  });
  const [cardTheme, setCardTheme] = useState("default");

  useEffect(() => {
    // Lock body scroll for the game
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on("uno_state", (state) => {
        setGameState(state);
        if (state.currentColor !== 'wild') {
          setShowColorPicker(null);
        }
      });
    }
    return () => {
      if (socket) socket.off("uno_state");
    };
  }, [socket]);

  // Resolve display names for everyone at the table (hook must run before any early return)
  const tableIds = gameState ? (gameState.players as string[]) : [];
  const names = usePlayerNames(tableIds);
  const nameOf = (id: string) =>
    id.startsWith("BOT_") ? `Bot ${id.slice(-3)}` : displayNameFor(id, names);

  const passTurn = () => socket?.emit("uno_pass_turn");
  const callUno = () => socket?.emit("uno_call_uno");
  const catchUno = (targetId: string) => socket?.emit("uno_catch_uno", { targetId });
  const returnLobby = () => socket?.emit("lobby_return");

  const playCard = (card: any, declaredColor?: string, targetId?: string) => {
    if (card.color === 'wild' && !declaredColor) {
      setShowColorPicker(card.id);
      return;
    }
    if (card.value === '7' && gameState?.modifiers?.sevenZero && !targetId) {
      setShowTargetPicker(card.id);
      return;
    }
    socket?.emit("uno_play", { cardId: card.id, declaredColor, targetId });
    setShowColorPicker(null);
    setShowTargetPicker(null);
  };

  if (!gameState || gameState.status === 'WAITING') {
    return null; // The Universal Lobby will handle waiting state.
  }

  const isMyTurn = gameState.currentTurn === mySteamId;

  const getOpponentPosition = (pId: string) => {
    const opponents = gameState.players.filter((id: string) => id !== mySteamId);
    const totalOpponents = opponents.length;
    if (totalOpponents === 0) return { containerStyle: {}, infoRotation: 0 };

    const indexInOpponents = opponents.indexOf(pId);
    let angleDeg = 90; 
    if (totalOpponents === 1) angleDeg = 90;
    else if (totalOpponents === 2) angleDeg = indexInOpponents === 0 ? 180 : 0;
    else if (totalOpponents === 3) angleDeg = indexInOpponents === 0 ? 180 : indexInOpponents === 1 ? 90 : 0;
    else angleDeg = 180 - ((indexInOpponents / (totalOpponents - 1)) * 180);

    const rad = (angleDeg * Math.PI) / 180;

    // Keep them near the edges
    const rx = 42; // vw
    const ry = 35; // vh

    const leftVw = 50 + Math.cos(rad) * rx;
    const topVh = 45 - Math.sin(rad) * ry; // shifted up slightly to give space to player

    // Orient cards to face center
    const rotation = 270 - angleDeg;

    return {
      containerStyle: {
        // Clamp so a seat's (rotated) box never leaves the screen; the px
        // bounds shrink with the viewport alongside the --card-* sizes.
        left: `clamp(min(175px, 24vw), ${leftVw}vw, calc(100vw - min(175px, 24vw)))`,
        top: `clamp(min(150px, 20vh), ${topVh}vh, calc(100vh - min(280px, 45vh)))`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`
      },
      infoRotation: -rotation
    };
  };

  const isPlayable = (card: any) => {
    if (gameState.drawPenalty > 0) return card.value === gameState.topCard?.value || card.value === '+2' || card.value === '+4';
    return card.color === 'wild' || card.color === gameState.currentColor || card.value === gameState.topCard?.value;
  };

  const hasPlayableCards = gameState.hand.some(isPlayable);
  const deckShouldGlow = isMyTurn && !hasPlayableCards && !gameState.hasDrawnThisTurn;

  const getCssColor = (color: string) => {
    if (color === 'red') return '#ff3333';
    if (color === 'yellow') return '#ffcc00';
    if (color === 'green') return '#33cc33';
    if (color === 'blue') return '#3366ff';
    return '#222';
  };

  // Portal to <body>: the site layout animates ancestors with transforms, which
  // would otherwise capture this fixed-position board and shift it off-center.
  return createPortal(
    <div className="uno-container">
      <div className="uno-board">
        
        {/* Opponents Area */}
        {Object.entries(gameState.opponents).map(([steamId, data]: any) => {
          const pos = getOpponentPosition(steamId);
          const isOppTurn = gameState.currentTurn === steamId;
          const oppCards = Array.from({ length: data.count || 0 });
          const isVulnerable = data.count === 1 && !data.calledUno;
          const oppName = nameOf(steamId);
          
          return (
            <div key={steamId} className={`opponent-container ${isOppTurn ? 'active-turn' : ''}`} style={pos.containerStyle}>
              <div className="opponent-info" style={{transform: `rotate(${pos.infoRotation}deg)`}}>
                <div className="opponent-avatar" title={oppName}>{oppName.substring(0, 2).toUpperCase()}</div>
                <div style={{fontSize: '0.85rem', fontWeight: 'bold', marginTop: '5px', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px'}}>{oppName}</div>
                <span style={{fontSize: '0.8rem', background: 'rgba(0,0,0,0.8)', padding: '4px 10px', borderRadius: '12px', marginTop: '5px', zIndex: 100}}>
                  {data.count || 0} Cards
                </span>
                {isVulnerable && (
                  <button onClick={() => catchUno(steamId)} className="btn-start-game" style={{fontSize: '0.8rem', padding: '5px 10px', marginTop: '5px'}}>
                    CATCH UNO!
                  </button>
                )}
                {data.calledUno && (
                  <span style={{color: '#ffcc00', fontWeight: 'bold', textShadow: '0 0 5px #ffcc00', marginTop: '5px'}}>UNO!</span>
                )}
              </div>
              
              <div style={{position: 'relative', width: `calc(var(--card-width) + ${(data.count - 1)} * var(--card-overlap))`, height: 'var(--card-height)', display: 'flex'}}>
                <AnimatePresence>
                  {oppCards.map((_, i) => (
                    <motion.div 
                      key={`${steamId}-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ position: 'absolute', top: 0, left: `calc(${i} * var(--card-overlap))`, zIndex: i, transition: 'left 0.3s ease-out' }}
                    >
                      <UnoCardBack theme={cardTheme} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}

        {/* Center Table */}
        <div className="center-table">
          <div className={`deck ${deckShouldGlow ? 'deck-glow' : ''}`} onClick={(isMyTurn && !gameState.hasDrawnThisTurn) ? () => socket?.emit("uno_draw") : undefined} />
          
          <div className="discard">
            <AnimatePresence>
              {gameState.topCard && (
                <motion.div 
                  key={gameState.topCard.id} 
                  layoutId={gameState.topCard.id}
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "tween", ease: "easeOut", duration: 0.3 }}
                >
                  <UnoCard card={gameState.topCard} theme={cardTheme} />
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Color Indicator */}
            {gameState.currentColor && (
              <div style={{position: 'absolute', bottom: '-40px', left: '50%', transform: 'translateX(-50%)', 
                           width: '20px', height: '20px', borderRadius: '50%', 
                           background: getCssColor(gameState.currentColor), boxShadow: `0 0 10px ${getCssColor(gameState.currentColor)}`}} />
            )}
          </div>
        </div>

        {/* Player Hand */}
        <div className="player-hand-container">
          <div style={{display: 'flex', gap: '20px', marginBottom: '20px', alignItems: 'center'}}>
            {isMyTurn && <div style={{color: '#00cc00', fontWeight: 'bold', fontSize: '1.5rem', textShadow: '0 0 10px #00cc00'}}>YOUR TURN</div>}
            
            {gameState.hasDrawnThisTurn && (
              <button onClick={passTurn} className="btn-start-game" style={{padding: '10px 20px', fontSize: '1rem', background: '#333'}}>
                PASS TURN
              </button>
            )}

            {gameState.hand.length <= 2 && !gameState.calledUno && (
              <button onClick={callUno} className="btn-start-game" style={{padding: '10px 20px', fontSize: '1rem', background: 'linear-gradient(45deg, #ff0000, #ff6600)'}}>
                UNO!
              </button>
            )}
            
            {gameState.calledUno && (
              <div style={{color: '#ffcc00', fontWeight: 'bold', fontSize: '1.2rem', textShadow: '0 0 10px #ffcc00'}}>UNO CALLED!</div>
            )}
          </div>
          
          <div className="player-hand">
            <AnimatePresence>
              {gameState.hand.map((card: any, index: number) => {
                const zIndex = index + 1;
                const playable = (isMyTurn && !gameState.hasDrawnThisTurn) ? isPlayable(card) : (isMyTurn && gameState.hasDrawnThisTurn && isPlayable(card)); // Allow playing any playable if it's turn, if drawn, only drawn is usually playable. We highlight playable.
                return (
                  <motion.div
                    key={card.id}
                    layoutId={card.id}
                    initial={{ y: 200, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -200, opacity: 0, scale: 0.5 }}
                    whileHover={{ y: -30, scale: 1.1, zIndex: 100 }}
                    transition={{ type: "tween", ease: "easeOut", duration: 0.3 }}
                    style={{ zIndex }}
                    onClick={() => playCard(card)}
                  >
                    <UnoCard card={card} playable={playable} theme={cardTheme} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Color Picker Modal */}
        <AnimatePresence>
          {showColorPicker && (
            <motion.div 
              className="color-picker"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <div className="color-btn red" onClick={() => playCard({id: showColorPicker, color: 'wild'}, 'red')} />
              <div className="color-btn yellow" onClick={() => playCard({id: showColorPicker, color: 'wild'}, 'yellow')} />
              <div className="color-btn green" onClick={() => playCard({id: showColorPicker, color: 'wild'}, 'green')} />
              <div className="color-btn blue" onClick={() => playCard({id: showColorPicker, color: 'wild'}, 'blue')} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Target Picker Modal */}
        <AnimatePresence>
          {showTargetPicker && (
            <motion.div 
              className="color-picker" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
            >
              <h3 style={{color: 'white', margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>Swap Hands With:</h3>
              {gameState.players.filter((p: string) => p !== mySteamId).map((p: string) => (
                <button key={p} className="btn-start-game" style={{padding: '10px', fontSize: '1rem'}} onClick={() => playCard({id: showTargetPicker, value: '7', color: gameState.hand.find((c: any) => c.id === showTargetPicker)?.color}, undefined, p)}>
                  {nameOf(p)}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Winner Modal */}
        {gameState.status === 'FINISHED' && (
          <div className="color-picker" style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <h1 style={{color: '#ffcc00', margin: '0 0 1rem 0'}}>GAME OVER</h1>
            <p style={{fontSize: '1.5rem', margin: '0 0 2rem 0'}}>{gameState.winner === mySteamId ? 'YOU WON! 🎉' : `${nameOf(gameState.winner)} won!`}</p>
            {gameState.players[0] === mySteamId && (
              <button onClick={returnLobby} className="btn-start-game">
                Return to Lobby
              </button>
            )}
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}

function UnoCard({ card, playable = false, theme = "default" }: { card: any, playable?: boolean, theme?: string }) {
  const displayValue = card.value === 'skip' ? '⊘' : card.value === 'reverse' ? '⟲' : card.value === 'color_picker' ? 'W' : card.value;
  
  return (
    <div className={`uno-card ${card.color} ${playable ? 'playable' : ''} ${theme}`}>
      <span className="value-top-left">{displayValue}</span>
      <div className="inner-oval">
        <span className="value-center">{displayValue}</span>
      </div>
      <span className="value-bottom-right">{displayValue}</span>
    </div>
  );
}

function UnoCardBack({ theme = "default" }: { theme?: string }) {
  return (
    <div className={`uno-card wild ${theme}`} style={{transformStyle: 'preserve-3d', margin: 0, cursor: 'default'}}>
      <div className="card-back" />
    </div>
  );
}
