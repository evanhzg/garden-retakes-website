"use client";

import React, { useState, useEffect, useRef } from "react";
import { SocketProvider, useSocket } from "@/components/games/SocketProvider";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import "./monopoly.css";

const DiceRoller = dynamic(() => import("./DiceRoller"), { ssr: false });

const DUMMY_STEAM_ID = "765611980" + Math.floor(Math.random() * 100000); 

export default function MonopolyGame() {
  const { socket, isConnected } = useSocket();
  const [gameState, setGameState] = useState<any>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  
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

  const isMyTurn = gameState.currentTurn === DUMMY_STEAM_ID;
  const myState = gameState.playerStates[DUMMY_STEAM_ID];
  
  const renderDice = () => {
    if (!gameState.lastRoll) return null;
    return (
      <div className="dice-container" style={{ opacity: isDiceRolling ? 0 : 1, transition: 'opacity 0.3s ease' }}>
        <div className="mono-dice static">
          {gameState.lastRoll[0]}
        </div>
        <div className="mono-dice static">
          {gameState.lastRoll[1]}
        </div>
      </div>
    );
  };

  const selectedSpace = selectedSpaceId !== null ? gameState.board[selectedSpaceId] : null;

  return (
    <div className="monopoly-container">
      {/* Player List */}
      <div className="mono-players">
        {gameState.players.map((pId: string) => {
          const s = gameState.playerStates[pId];
          let posClass = 'pos-1';
          if (pId === DUMMY_STEAM_ID) posClass = 'pos-0';
          else {
            const others = gameState.players.filter((p: string) => p !== DUMMY_STEAM_ID);
            const otherIdx = others.indexOf(pId);
            posClass = `pos-${otherIdx + 1}`;
          }

          return (
            <div key={pId} className={`mono-player-card ${posClass}`} style={{borderColor: s.color, boxShadow: gameState.currentTurn === pId ? `0 0 15px ${s.color}` : 'none'}}>
              <h3 style={{margin: 0, color: s.color}}>
                {pId.startsWith('BOT') ? `Bot ${pId.substring(pId.length-4)}` : `Player ${pId.substring(pId.length-4)}`}
              </h3>
              <p style={{margin: '5px 0 0 0', fontSize: '1.5rem', fontWeight: 'bold'}}>${s.money}</p>
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
                className={`mono-space s${space.id} ${isCorner ? 'corner' : ''} ${space.mortgaged ? 'mortgaged' : ''}`}
                onClick={() => { if(space.type === 'property' || space.type === 'rail' || space.type === 'util') setSelectedSpaceId(space.id) }}
              >
                {space.group && <div className={`color-bar ${space.group}`} />}
                
                <div style={{padding: '2px', fontSize: isCorner ? '1rem' : '0.6rem'}}>{space.name}</div>
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
            {renderDice()}
            
            <div style={{display: 'flex', gap: '10px', marginTop: '1rem'}}>
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
               <button className="mono-btn" disabled={!isMyTurn || gameState.turnPhase !== 'ROLL'} onClick={payJail} style={{background: '#ff0000', marginTop: '10px'}}>
                 PAY $50 TO LEAVE JAIL
               </button>
            )}

          </div>
        </div>

        {isDiceRolling && gameState?.lastRoll && (
          <DiceRoller 
            lastRoll={gameState.lastRoll} 
            rollKey={rollTriggerKey} 
            onAnimationComplete={() => setIsDiceRolling(false)} 
          />
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

    </div>
  );
}
