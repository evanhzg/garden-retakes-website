import React from 'react';
import { staticSprite } from './sprites';
import './pkmn.css';

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
    <div className="pkp-overlay">
      <div className="pkp-head">
        <h2>POKéMON PARTY</h2>
        <button className="pkp-close" onClick={onClose}>CLOSE</button>
      </div>

      <div className="pkp-grid">
        {party.map((mon, i) => {
          const moves: string[] = (() => {
            try { return JSON.parse(mon.Moves || "[]"); } catch { return []; }
          })();
          const maxHp = 20; // generic until real HP persistence lands
          const ratio = Math.min(1, (mon.Hp ?? 0) / maxHp);
          return (
            <div key={mon.Id} className="pkp-card">
              <img src={staticSprite(mon.Species)} alt={mon.Species} />
              <div className="pkp-info">
                <div className="pkp-name">
                  <span>{(mon.Nickname || mon.Species).toUpperCase()}</span>
                  <span style={{ color: '#555' }}>Lv{mon.Level}</span>
                </div>
                <div className="pkb-hp-row">
                  <span className="pkb-hp-tag">HP</span>
                  <div className="pkb-hp-track">
                    <div
                      className={`pkb-hp-fill ${ratio > 0.5 ? 'hp-green' : ratio > 0.2 ? 'hp-yellow' : 'hp-red'}`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
                <div className="pkp-moves">{moves.map(m => m.toUpperCase()).join(' · ') || '—'}</div>
              </div>
              {isBattleMode && (mon.Hp ?? 0) > 0 && i > 0 && (
                <button className="pkp-switch" onClick={() => onSwitch?.(i + 1)}>SWITCH</button>
              )}
            </div>
          );
        })}
      </div>

      {party.length === 0 && (
        <p style={{ textAlign: 'center', color: '#cbb8e0', marginTop: 32 }}>Your party is empty.</p>
      )}
    </div>
  );
}
