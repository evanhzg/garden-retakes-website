import React, { useEffect } from 'react';
import { useSocket } from "@/components/games/SocketProvider";

export default function PartyMenu({ 
  party, 
  onClose,
  isBattleMode = false,
  onSwitch
}: { 
  party: any[], 
  onClose: () => void,
  isBattleMode?: boolean,
  onSwitch?: (index: number) => void
}) {

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 110, display: 'flex', flexDirection: 'column',
      padding: 32, color: 'white'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2>Pokémon Party</h2>
        <button onClick={onClose} style={{ padding: '8px 16px', cursor: 'pointer', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4 }}>
          CLOSE
        </button>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        {party.map((mon, i) => (
          <div key={mon.Id} style={{ 
            background: '#333', border: '2px solid #555', borderRadius: 8, padding: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0' }}>{mon.Nickname || mon.Species} <span style={{ fontSize: 14, color: '#aaa' }}>Lv.{mon.Level}</span></h3>
              <p style={{ margin: 0, fontSize: 14 }}>HP: {mon.Hp} / 20</p>
              <div style={{ width: 150, height: 8, background: '#111', borderRadius: 4, marginTop: 4 }}>
                <div style={{ width: `${(mon.Hp / 20) * 100}%`, height: '100%', background: mon.Hp > 10 ? '#4ade80' : '#ef4444' }} />
              </div>
            </div>
            
            {isBattleMode && mon.Hp > 0 && (
              <button onClick={() => onSwitch?.(i + 1)} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                SWITCH
              </button>
            )}
          </div>
        ))}
      </div>
      
      {party.length === 0 && (
        <p style={{ textAlign: 'center', color: '#aaa', marginTop: 32 }}>Your party is empty.</p>
      )}
    </div>
  );
}
