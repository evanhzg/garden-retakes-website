import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from "@/components/games/SocketProvider";
import PartyMenu from './PartyMenu';

export default function BattleOverlay({ onBattleEnd }: { onBattleEnd: () => void }) {
  const { socket } = useSocket();
  const [logs, setLogs] = useState<string[]>([]);
  const [wildPokemon, setWildPokemon] = useState<any>(null);
  const [playerHp, setPlayerHp] = useState<number>(100);
  const [playerMaxHp, setPlayerMaxHp] = useState<number>(100);
  const [enemyHp, setEnemyHp] = useState<number>(100);
  const [enemyMaxHp, setEnemyMaxHp] = useState<number>(100);
  const [canAct, setCanAct] = useState<boolean>(false);
  const [showParty, setShowParty] = useState(false);
  const [party, setParty] = useState<any[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket?.emit("pkmn_get_party");
    
    const handleParty = (data: any) => {
      setParty(data);
    };
    socket?.on("pkmn_party_data", handleParty);
    return () => { socket?.off("pkmn_party_data", handleParty); }
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleStart = (data: any) => {
      setWildPokemon(data.wildPokemon);
      setLogs(prev => [...prev, `Wild ${data.wildPokemon.species} appeared!`]);
    };

    const handleChunk = (chunk: string) => {
      console.log("BATTLE CHUNK", chunk);
      const lines = chunk.split('\n');
      const newLogs: string[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('|');
        if (parts.length < 2) continue;
        
        const cmd = parts[1];
        
        if (cmd === 'turn') {
          newLogs.push(`--- Turn ${parts[2]} ---`);
          setCanAct(true);
        } else if (cmd === 'move') {
          const user = parts[2].replace('p1a: Player', 'You').replace('p2a: Wild Pokémon', `Wild ${wildPokemon?.species || 'Pokémon'}`);
          const move = parts[3];
          newLogs.push(`${user} used ${move}!`);
        } else if (cmd === '-damage') {
          const target = parts[2];
          const hpPart = parts[3].split(' ')[0]; // e.g. "15/20"
          const [current, max] = hpPart.split('/');
          
          if (target.startsWith('p1')) {
            setPlayerHp(parseInt(current));
            if (max) setPlayerMaxHp(parseInt(max));
          } else {
            setEnemyHp(parseInt(current));
            if (max) setEnemyMaxHp(parseInt(max));
          }
          newLogs.push(`${target.includes('p1') ? 'You' : 'The wild Pokémon'} took damage!`);
        } else if (cmd === 'faint') {
          const target = parts[2];
          newLogs.push(`${target.includes('p1') ? 'You' : 'The wild Pokémon'} fainted!`);
        } else if (cmd === 'win') {
          const winner = parts[2];
          newLogs.push(`${winner} won the battle!`);
          setTimeout(() => onBattleEnd(), 3000);
        } else if (cmd === 'error') {
          newLogs.push(`Error: ${parts[2]}`);
          setCanAct(true);
        } else if (cmd === 'message') {
          newLogs.push(parts[2]);
        }
      }

      if (newLogs.length > 0) {
        setLogs(prev => [...prev, ...newLogs]);
      }
    };

    const handleEnd = () => {
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
  }, [socket, wildPokemon, onBattleEnd]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const doMove = (moveIdx: number) => {
    if (!canAct) return;
    setCanAct(false);
    socket?.emit('pkmn_battle_action', { type: 'move', move: moveIdx });
  };

  const doCatch = () => {
    if (!canAct) return;
    setCanAct(false);
    socket?.emit('pkmn_battle_action', { type: 'catch' });
  };

  const doSwitch = (idx: number) => {
    if (!canAct) return;
    setCanAct(false);
    setShowParty(false);
    socket?.emit('pkmn_battle_action', { type: 'switch', switchIdx: idx });
  };

  const doRun = () => {
    if (!canAct) return;
    setCanAct(false);
    socket?.emit('pkmn_battle_action', { type: 'run' });
  };

  const hpBarColor = (hp: number, maxHp: number) => {
    const ratio = hp / maxHp;
    if (ratio > 0.5) return '#4ade80'; // Green
    if (ratio > 0.2) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', flexDirection: 'column'
    }}>
      {/* Top Half: Battle Scene */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'space-between', padding: 32 }}>
        
        {/* Enemy UI */}
        <div style={{ background: '#fff', color: '#000', padding: 16, borderRadius: 8, minWidth: 200, alignSelf: 'flex-start', border: '4px solid #000' }}>
          <h3>Wild {wildPokemon ? wildPokemon.species : 'Pokémon'}</h3>
          <div style={{ height: 10, background: '#ccc', borderRadius: 5, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(enemyHp/enemyMaxHp)*100}%`, background: hpBarColor(enemyHp, enemyMaxHp), transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Player UI */}
        <div style={{ background: '#fff', color: '#000', padding: 16, borderRadius: 8, minWidth: 200, alignSelf: 'flex-end', border: '4px solid #000' }}>
          <h3>Your Pokémon</h3>
          <div style={{ height: 10, background: '#ccc', borderRadius: 5, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(playerHp/playerMaxHp)*100}%`, background: hpBarColor(playerHp, playerMaxHp), transition: 'width 0.3s' }} />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, textAlign: 'right' }}>{playerHp} / {playerMaxHp}</p>
        </div>
      </div>

      {/* Bottom Half: Logs and Menu */}
      <div style={{ height: 200, borderTop: '4px solid #fff', display: 'flex' }}>
        <div style={{ flex: 1, padding: 16, overflowY: 'auto', background: '#222', fontSize: 18, lineHeight: 1.5 }}>
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
          <div ref={logsEndRef} />
        </div>
        
        <div style={{ width: 250, borderLeft: '4px solid #fff', background: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 4, padding: 8 }}>
          <button 
            disabled={!canAct} 
            onClick={() => doMove(1)}
            style={{ fontSize: 20, cursor: canAct ? 'pointer' : 'not-allowed', background: '#ef4444', color: '#fff', border: '2px solid #fff', borderRadius: 4, opacity: canAct ? 1 : 0.5 }}>
            FIGHT
          </button>
          <button 
            disabled={!canAct} 
            onClick={doCatch}
            style={{ fontSize: 20, cursor: canAct ? 'pointer' : 'not-allowed', background: '#eab308', color: '#fff', border: '2px solid #fff', borderRadius: 4, opacity: canAct ? 1 : 0.5 }}>
            BAG (Pokéball)
          </button>
          <button 
            disabled={!canAct} 
            onClick={() => setShowParty(true)}
            style={{ fontSize: 20, cursor: canAct ? 'pointer' : 'not-allowed', background: '#3b82f6', color: '#fff', border: '2px solid #fff', borderRadius: 4, opacity: canAct ? 1 : 0.5 }}>
            PKMN
          </button>
          <button 
            disabled={!canAct} 
            onClick={doRun}
            style={{ fontSize: 20, cursor: canAct ? 'pointer' : 'not-allowed', background: '#10b981', color: '#fff', border: '2px solid #fff', borderRadius: 4, opacity: canAct ? 1 : 0.5 }}>
            RUN
          </button>
        </div>
      </div>
      
      {showParty && (
        <PartyMenu 
          party={party} 
          onClose={() => setShowParty(false)} 
          isBattleMode={true} 
          onSwitch={doSwitch} 
        />
      )}
    </div>
  );
}
