"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor } from "@/components/games/hooks";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import "./monopoly.css";

const DiceRoller = dynamic(() => import("./DiceRoller"), { ssr: false });

const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000); 

export default function MonopolyGame() {
  const { socket, isConnected, steamId } = useSocket();
  const mySteamId = steamId ?? DUMMY_STEAM_ID;
  const [gameState, setGameState] = useState<any>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  
  const [hoveredSpace, setHoveredSpace] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [rollTriggerKey, setRollTriggerKey] = useState(0);
  const prevRollIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Lock body scroll for the game
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on("monopoly_state", (state) => {
        setGameState(state);
      });
    }
    return () => {
      if (socket) socket.off("monopoly_state");
    };
  }, [socket]);

  useEffect(() => {
    if (gameState) {
      if (gameState.rollId && gameState.rollId !== prevRollIdRef.current) {
        setRollTriggerKey(k => k + 1);
        setIsDiceRolling(true);
        prevRollIdRef.current = gameState.rollId;
      }
    }
  }, [gameState]);

  const rollDice = () => socket?.emit("monopoly_roll");
  const buyProperty = () => socket?.emit("monopoly_buy");
  const endTurn = () => socket?.emit("monopoly_end_turn");
  const payJail = () => socket?.emit("monopoly_pay_jail");
  
  const buildHouse = (spaceId: number) => { socket?.emit("monopoly_build", { spaceId }); setSelectedSpaceId(null); }
  const mortgageProperty = (spaceId: number) => { socket?.emit("monopoly_mortgage", { spaceId }); setSelectedSpaceId(null); }

  if (!gameState || gameState.status === 'WAITING') {
    return null;
  }

  const isMyTurn = gameState.currentTurn === mySteamId;
  const myState = gameState.playerStates[mySteamId];
  
  const getPlayerPosition = (pId: string) => {
    const totalPlayers = gameState.players.length;
    if (totalPlayers === 0) return { left: '50%', top: '50%' };

    const index = gameState.players.indexOf(pId);
    // Evenly space players around a circle
    const angleDeg = (index / totalPlayers) * 360;
    const rad = (angleDeg * Math.PI) / 180;

    // Ellipse radii to keep cards near the edges
    const rx = 38; // vw
    const ry = 35; // vh

    const leftVw = 50 + Math.cos(rad) * rx;
    const topVh = 50 - Math.sin(rad) * ry;

    return {
      left: `clamp(10vw, ${leftVw}vw, 90vw)`,
      top: `clamp(10vh, ${topVh}vh, 90vh)`,
      transform: `translate(-50%, -50%)`
    };
  };

  const selectedSpace = selectedSpaceId !== null ? gameState.board[selectedSpaceId] : null;

  return createPortal(
    <div className="monopoly-container">
      {/* Player List */}
      <div className="mono-players">
        {gameState.players.map((pId: string) => {
          const s = gameState.playerStates[pId];
          const pos = getPlayerPosition(pId);
          const isTurn = gameState.currentTurn === pId;
          const isMe = pId === mySteamId;
          const isMinimized = !isMe && !isTurn;

          return (
            <div 
              key={pId} 
              className={`mono-player-card ${isTurn ? 'active' : ''} ${isMinimized ? 'minimized' : ''}`} 
              style={{...pos, borderColor: s.color, boxShadow: isTurn ? `0 0 25px ${s.color}` : 'none'}}
            >
              <div className="mono-player-avatar" style={{color: s.color}}>
                {pId.substring(pId.length-2).toUpperCase()}
              </div>
              
              <div className="compact-money" style={{color: s.color}}>${s.money}</div>

              <div className="details">
                <h3 style={{margin: 0, color: s.color, fontSize: '1rem'}}>
                  {pId.startsWith('BOT') ? `Bot ${pId.substring(pId.length-4)}` : `Player ${pId.substring(pId.length-4)}`}
                </h3>
                <p style={{margin: '0', fontSize: '1.25rem', fontWeight: 'bold'}}>${s.money}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mono-board-wrapper">
        <div className="mono-board">
          {/* Render 40 Spaces */}
          {gameState.board.map((space: any) => {
            const isCorner = [0, 10, 20, 30].includes(space.id);
            const playersOnSpace = gameState.players.filter((p: string) => gameState.playerStates[p].position === space.id);
            const houses = space.houses || 0;

            return (
              <div 
                key={space.id} 
                className={`mono-space s${space.id} ${isCorner ? 'corner' : ''} ${space.mortgaged ? 'mortgaged' : ''} ${space.group ? space.group + '-bg' : ''}`}
                onClick={() => { if(space.type === 'property' || space.type === 'rail' || space.type === 'util') setSelectedSpaceId(space.id) }}
                onMouseEnter={(e) => {
                  if (space.name && space.name.length > 8 && !isCorner) {
                    setHoveredSpace(space);
                  }
                }}
                onMouseMove={(e) => {
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredSpace(null)}
              >
                {space.group && <div className={`color-bar ${space.group}`} />}
                
                <div className="space-name" style={{fontSize: isCorner ? '1rem' : '0.6rem'}}>{space.name}</div>
                {space.price && <div style={{marginTop: 'auto', marginBottom: '8px', fontSize: '0.6rem'}}>${space.price}</div>}
                
                {/* Houses / Hotels rendering */}
                {houses > 0 && houses < 5 && (
                  <div className="houses-container">
                    {Array.from({length: houses}).map((_, i) => <div key={i} className="house-icon"/>)}
                  </div>
                )}
                {houses === 5 && (
                  <div className="houses-container">
                    <div className="hotel-icon"/>
                  </div>
                )}

                {/* Owner Marker */}
                {space.owner && (
                  <div className="owner-marker" style={{backgroundColor: gameState.playerStates[space.owner].color}} />
                )}

                {/* Player Tokens */}
                <AnimatePresence>
                  {playersOnSpace.map((pId: string, idx: number) => {
                    const ps = gameState.playerStates[pId];
                    return (
                      <motion.div 
                        key={pId} 
                        className="player-token"
                        layoutId={`token-${pId}`}
                        style={{ backgroundColor: ps.color, marginLeft: `${idx * 15 - 10}px` }}
                        transition={{ type: "spring", stiffness: 100, damping: 15 }}
                      >
                        {pId.substring(pId.length-2)}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Center Area */}
          <div className="mono-center">
            {/* Overlay the 3D dice here so they sit in the center of the board */}
            {gameState?.lastRoll && (
              <DiceRoller 
                lastRoll={gameState.lastRoll} 
                rollKey={rollTriggerKey} 
                onAnimationComplete={() => setIsDiceRolling(false)} 
              />
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons (Rendered Flat, outside of 3D context) */}
      <div style={{
        position: 'absolute', 
        top: '60%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        gap: '10px',
        zIndex: 1000
      }}>
        <div style={{display: 'flex', gap: '10px'}}>
          <button className="mono-btn" disabled={!isMyTurn || gameState.turnPhase !== 'ROLL' || isDiceRolling} onClick={rollDice}>
            ROLL DICE
          </button>
          
          <button className="mono-btn" disabled={!isMyTurn || gameState.turnPhase !== 'ACTION' || isDiceRolling} onClick={buyProperty} style={{background: 'linear-gradient(45deg, #cc00cc, #6600ff)'}}>
            BUY
          </button>

          <button className="mono-btn" disabled={!isMyTurn || (gameState.turnPhase !== 'END' && gameState.turnPhase !== 'ACTION') || isDiceRolling} onClick={endTurn} style={{background: 'linear-gradient(45deg, #ff3333, #ff9900)'}}>
            END TURN
          </button>
        </div>

        {myState?.jailed && (
           <button className="mono-btn" disabled={!isMyTurn || gameState.turnPhase !== 'ROLL'} onClick={payJail} style={{background: '#ff0000'}}>
             PAY $50 TO LEAVE JAIL
           </button>
        )}
      </div>

      <div className="action-logs">
        {gameState.logs.map((l: any) => {
          let type = '';
          if (l.text.includes('bought') || l.text.includes('built')) type = 'buy';
          else if (l.text.includes('paid') || l.text.includes('tax') || l.text.includes('BANKRUPT')) type = 'pay';
          else if (l.text.includes('Jail') || l.text.includes('jail')) type = 'jail';
          else if (l.text.includes('Card:')) type = 'card';
          return <div key={l.id} className={`log-entry ${type}`}>{l.text}</div>;
        })}
      </div>

      {/* Property Modal */}
      <AnimatePresence>
        {selectedSpace && (
          <motion.div 
            className="property-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedSpaceId(null) }}
          >
            <motion.div 
              className="property-modal"
              initial={{ y: 50, scale: 0.9 }} animate={{ y: 0, scale: 1 }} exit={{ y: 50, scale: 0.9 }}
            >
              <div className={`property-modal-header ${selectedSpace.group}`}>
                {selectedSpace.name}
              </div>
              <div className="property-modal-body">
                {selectedSpace.type === 'property' && (
                  <>
                    <div>Rent: ${selectedSpace.rent[0]}</div>
                    <div>With 1 House: ${selectedSpace.rent[1]}</div>
                    <div>With 2 Houses: ${selectedSpace.rent[2]}</div>
                    <div>With 3 Houses: ${selectedSpace.rent[3]}</div>
                    <div>With 4 Houses: ${selectedSpace.rent[4]}</div>
                    <div>With HOTEL: ${selectedSpace.rent[5]}</div>
                    <hr style={{width: '100%'}}/>
                    <div>Houses cost ${selectedSpace.houseCost} each</div>
                  </>
                )}
                {selectedSpace.type === 'rail' && (
                  <><div>Rent: $25 / $50 / $100 / $200</div></>
                )}
                {selectedSpace.type === 'util' && (
                  <><div>Rent: 4x / 10x Dice Roll</div></>
                )}
                
                {selectedSpace.owner && (
                  <div style={{marginTop: '1rem', fontWeight: 'bold', color: gameState.playerStates[selectedSpace.owner].color}}>
                    Owned by {selectedSpace.owner.substring(0,6)}
                  </div>
                )}
              </div>
              
              {selectedSpace.owner === DUMMY_STEAM_ID && (
                <div className="property-modal-actions">
                  {selectedSpace.type === 'property' && (
                    <button className="modal-btn" onClick={() => buildHouse(selectedSpace.id)}>Build House (${selectedSpace.houseCost})</button>
                  )}
                  {!selectedSpace.mortgaged && (
                    <button className="modal-btn danger" onClick={() => mortgageProperty(selectedSpace.id)}>Mortgage (+${Math.floor(selectedSpace.price/2)})</button>
                  )}
                  {selectedSpace.mortgaged && (
                    <span style={{color: 'red', fontWeight: 'bold'}}>MORTGAGED</span>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip for long board names */}
      {hoveredSpace && (
        <div 
          className="mono-tooltip" 
          style={{
            left: Math.min(mousePos.x + 15, typeof window !== 'undefined' ? window.innerWidth - 150 : 0), 
            top: mousePos.y + 15
          }}
        >
          <strong style={{display: 'block', fontSize: '1rem', color: '#ffcc00'}}>{hoveredSpace.name}</strong>
          {hoveredSpace.price && <span style={{fontSize: '0.8rem', color: '#aaa'}}>${hoveredSpace.price}</span>}
        </div>
      )}

    </div>,
    document.body
  );
}
