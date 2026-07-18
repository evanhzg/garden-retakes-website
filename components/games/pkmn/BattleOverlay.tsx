import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from "@/components/games/SocketProvider";
import PartyMenu from './PartyMenu';
import { frontSprite, backSprite, staticSprite, playCry } from './sprites';
import './pkmn.css';

type BattleMon = { species: string; level?: number; moves?: string[]; nickname?: string | null };

const prettyMove = (m: string) =>
  m.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

export default function BattleOverlay({ onBattleEnd }: { onBattleEnd: () => void }) {
  const { socket } = useSocket();
  const [logs, setLogs] = useState<string[]>([]);
  const [wildPokemon, setWildPokemon] = useState<BattleMon | null>(null);
  const [playerMon, setPlayerMon] = useState<BattleMon | null>(null);
  const [trainerName, setTrainerName] = useState<string | null>(null);
  const [playerHp, setPlayerHp] = useState<number>(100);
  const [playerMaxHp, setPlayerMaxHp] = useState<number>(100);
  const [enemyHp, setEnemyHp] = useState<number>(100);
  const [enemyMaxHp, setEnemyMaxHp] = useState<number>(100);
  const [canAct, setCanAct] = useState<boolean>(false);
  const [showParty, setShowParty] = useState(false);
  const [showMoves, setShowMoves] = useState(false);
  const [party, setParty] = useState<any[]>([]);
  const [enemyHit, setEnemyHit] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [enemyFainted, setEnemyFainted] = useState(false);
  const [playerFainted, setPlayerFainted] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket?.emit("pkmn_get_party");
    const handleParty = (data: any) => setParty(data);
    socket?.on("pkmn_party_data", handleParty);
    return () => { socket?.off("pkmn_party_data", handleParty); }
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleStart = (data: any) => {
      setWildPokemon(data.wildPokemon);
      if (data.playerPokemon) setPlayerMon(data.playerPokemon);
      setTrainerName(data.trainerName ?? null);
      setLogs([data.trainerName
        ? `${data.trainerName} wants to battle! They sent out ${data.wildPokemon.species}!`
        : `A wild ${data.wildPokemon.species} appeared!`]);
      playCry(data.wildPokemon.species);
    };

    const handleChunk = (chunk: string) => {
      const lines = chunk.split('\n');
      const newLogs: string[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('|');
        if (parts.length < 2) continue;
        const cmd = parts[1];

        const monName = (ref: string) => {
          const isPlayer = ref.startsWith('p1');
          return isPlayer
            ? (playerMon?.nickname || playerMon?.species || 'Your Pokémon').toUpperCase()
            : `${trainerName ? "Foe" : "Wild"} ${(wildPokemon?.species || 'Pokémon').toUpperCase()}`;
        };

        if (cmd === 'turn') {
          setCanAct(true);
        } else if (cmd === 'move') {
          newLogs.push(`${monName(parts[2])} used ${parts[3].toUpperCase()}!`);
        } else if (cmd === '-damage' || cmd === '-heal') {
          const target = parts[2];
          const hpPart = parts[3].split(' ')[0];
          const [current, max] = hpPart.split('/');
          const cur = parseInt(current) || 0;
          if (target.startsWith('p1')) {
            setPlayerHp(cur);
            if (max) setPlayerMaxHp(parseInt(max));
            if (cmd === '-damage') { setPlayerHit(true); setTimeout(() => setPlayerHit(false), 400); }
          } else {
            setEnemyHp(cur);
            if (max) setEnemyMaxHp(parseInt(max));
            if (cmd === '-damage') { setEnemyHit(true); setTimeout(() => setEnemyHit(false), 400); }
          }
        } else if (cmd === '-supereffective') {
          newLogs.push(`It's super effective!`);
        } else if (cmd === '-resisted') {
          newLogs.push(`It's not very effective…`);
        } else if (cmd === '-crit') {
          newLogs.push(`A critical hit!`);
        } else if (cmd === '-miss') {
          newLogs.push(`The attack missed!`);
        } else if (cmd === '-status') {
          newLogs.push(`${monName(parts[2])} is ${parts[3] === 'brn' ? 'burned' : parts[3] === 'psn' ? 'poisoned' : parts[3] === 'par' ? 'paralyzed' : parts[3]}!`);
        } else if (cmd === '-boost' || cmd === '-unboost') {
          newLogs.push(`${monName(parts[2])}'s ${parts[3].toUpperCase()} ${cmd === '-boost' ? 'rose' : 'fell'}!`);
        } else if (cmd === 'faint') {
          const isPlayer = parts[2].startsWith('p1');
          newLogs.push(`${monName(parts[2])} fainted!`);
          if (isPlayer) setPlayerFainted(true); else setEnemyFainted(true);
          const sp = isPlayer ? playerMon?.species : wildPokemon?.species;
          if (sp) playCry(sp, 0.25);
        } else if (cmd === 'win') {
          newLogs.push(parts[2] === 'Player' ? `You won the battle!` : `You were defeated…`);
          setTimeout(() => onBattleEnd(), 3000);
        } else if (cmd === 'error') {
          newLogs.push(`It failed!`);
          setCanAct(true);
        } else if (cmd === 'message') {
          newLogs.push(parts[2]);
          if (parts[2].startsWith('Gotcha!')) setEnemyFainted(true);
        } else if (cmd === 'switch' && parts[2]?.startsWith('p1a')) {
          // Player switched: update shown mon (details like "Charmander, L5")
          const details = (parts[3] || '').split(',');
          const species = details[0]?.trim();
          const lvl = parseInt((details[1] || '').replace(/[^0-9]/g, ''));
          if (species) {
            setPlayerMon(prev => ({ ...prev, species, level: lvl || prev?.level, moves: prev?.moves }));
            setPlayerFainted(false);
            newLogs.push(`Go! ${species.toUpperCase()}!`);
          }
        }
      }
      if (newLogs.length > 0) setLogs(prev => [...prev.slice(-30), ...newLogs]);
    };

    const handleEnd = () => {
      socket.emit("pkmn_get_party"); // refresh party (XP, catches) for the overworld
      onBattleEnd();
    };

    socket.on('pkmn_battle_start', handleStart);
    socket.on('pkmn_battle_chunk', handleChunk);
    socket.on('pkmn_battle_end', handleEnd);
    return () => {
      socket.off('pkmn_battle_start', handleStart);
      socket.off('pkmn_battle_chunk', handleChunk);
      socket.off('pkmn_battle_end', handleEnd);
    };
  }, [socket, wildPokemon, playerMon, trainerName, onBattleEnd]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  const act = (payload: any) => {
    if (!canAct) return;
    setCanAct(false);
    setShowMoves(false);
    setShowParty(false);
    socket?.emit('pkmn_battle_action', payload);
  };

  const hpClass = (hp: number, maxHp: number) => {
    const r = hp / Math.max(1, maxHp);
    return r > 0.5 ? 'hp-green' : r > 0.2 ? 'hp-yellow' : 'hp-red';
  };

  const moves = playerMon?.moves ?? [];

  return (
    <div className="pkb-overlay">
      {/* Battle arena */}
      <div className="pkb-arena">
        {/* Enemy info box (top-left) */}
        <div className="pkb-infobox pkb-enemy-box">
          <div className="pkb-info-name">
            <span>{(wildPokemon?.species || '…').toUpperCase()}</span>
            <span className="pkb-level">Lv{wildPokemon?.level ?? '?'}</span>
          </div>
          <div className="pkb-hp-row">
            <span className="pkb-hp-tag">HP</span>
            <div className="pkb-hp-track">
              <div className={`pkb-hp-fill ${hpClass(enemyHp, enemyMaxHp)}`} style={{ width: `${(enemyHp / Math.max(1, enemyMaxHp)) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Enemy sprite (top-right platform) */}
        <div className={`pkb-slot pkb-enemy-slot ${enemyHit ? 'hit' : ''} ${enemyFainted ? 'fainted' : ''}`}>
          <div className="pkb-platform" />
          {wildPokemon && (
            <img
              className="pkb-sprite"
              src={frontSprite(wildPokemon.species)}
              onError={(e) => { (e.target as HTMLImageElement).src = staticSprite(wildPokemon.species); }}
              alt={wildPokemon.species}
            />
          )}
        </div>

        {/* Player sprite (bottom-left platform) */}
        <div className={`pkb-slot pkb-player-slot ${playerHit ? 'hit' : ''} ${playerFainted ? 'fainted' : ''}`}>
          <div className="pkb-platform" />
          {playerMon && (
            <img
              className="pkb-sprite pkb-back"
              src={backSprite(playerMon.species)}
              onError={(e) => { (e.target as HTMLImageElement).src = staticSprite(playerMon.species); }}
              alt={playerMon.species}
            />
          )}
        </div>

        {/* Player info box (bottom-right) */}
        <div className="pkb-infobox pkb-player-box">
          <div className="pkb-info-name">
            <span>{(playerMon?.nickname || playerMon?.species || 'YOUR PKMN').toUpperCase()}</span>
            <span className="pkb-level">Lv{playerMon?.level ?? '?'}</span>
          </div>
          <div className="pkb-hp-row">
            <span className="pkb-hp-tag">HP</span>
            <div className="pkb-hp-track">
              <div className={`pkb-hp-fill ${hpClass(playerHp, playerMaxHp)}`} style={{ width: `${(playerHp / Math.max(1, playerMaxHp)) * 100}%` }} />
            </div>
          </div>
          <div className="pkb-hp-num">{playerHp} / {playerMaxHp}</div>
        </div>
      </div>

      {/* Dialog + actions */}
      <div className="pkb-bottom">
        <div className="pkb-dialog">
          {logs.slice(-4).map((l, i) => <div key={`${i}-${l}`} className="pkb-line">{l}</div>)}
          <div ref={logsEndRef} />
        </div>

        {showMoves ? (
          <div className="pkb-actions pkb-moves">
            {moves.slice(0, 4).map((m) => (
              <button key={m} disabled={!canAct} className="pkb-btn pkb-move" onClick={() => act({ type: 'move', move: m })}>
                {prettyMove(m)}
              </button>
            ))}
            {Array.from({ length: Math.max(0, 4 - moves.length) }).map((_, i) => (
              <div key={i} className="pkb-btn pkb-empty">—</div>
            ))}
            <button className="pkb-btn pkb-cancel" onClick={() => setShowMoves(false)}>◀ BACK</button>
          </div>
        ) : (
          <div className="pkb-actions">
            <button disabled={!canAct} className="pkb-btn pkb-fight" onClick={() => (moves.length ? setShowMoves(true) : act({ type: 'move', move: 1 }))}>FIGHT</button>
            <button disabled={!canAct || !!trainerName} className="pkb-btn pkb-ball" onClick={() => act({ type: 'catch' })}>BALL</button>
            <button disabled={!canAct} className="pkb-btn pkb-pkmn" onClick={() => setShowParty(true)}>PKMN</button>
            <button disabled={!canAct} className="pkb-btn pkb-run" onClick={() => act({ type: 'run' })}>RUN</button>
          </div>
        )}
      </div>

      {showParty && (
        <PartyMenu
          party={party}
          onClose={() => setShowParty(false)}
          isBattleMode={true}
          onSwitch={(idx) => act({ type: 'switch', switchIdx: idx })}
        />
      )}
    </div>
  );
}
