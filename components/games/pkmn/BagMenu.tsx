import React, { useState } from 'react';
import { staticSprite } from './sprites';
import './pkmn.css';

export type BagItem = { id: string; name: string; kind: 'ball' | 'heal'; desc: string; count: number };

/**
 * Bag menu, shared by battle (BAG action) and the overworld.
 * - battle: balls throw to catch, potions heal the active Pokémon.
 * - overworld: potions heal a chosen party member; balls are battle-only.
 */
export default function BagMenu({
  items,
  mode,
  party = [],
  onUseItem,
  onThrowBall,
  onClose,
}: {
  items: BagItem[];
  mode: 'battle' | 'overworld';
  party?: any[];
  onUseItem: (itemId: string, monId?: string) => void;
  onThrowBall?: (itemId: string) => void;
  onClose: () => void;
}) {
  const [pickTargetFor, setPickTargetFor] = useState<BagItem | null>(null);

  const clickItem = (it: BagItem) => {
    if (it.kind === 'ball') {
      if (mode === 'battle') onThrowBall?.(it.id);
      return;
    }
    // heal item
    if (mode === 'battle') {
      onUseItem(it.id);
    } else {
      setPickTargetFor(it); // choose which party member to heal
    }
  };

  return (
    <div className="pkg-overlay">
      <div className="pkg-head">
        <h2>BAG</h2>
        <button className="pkp-close" onClick={onClose}>CLOSE</button>
      </div>

      {items.length === 0 && <p className="pkg-empty">Your bag is empty.</p>}

      {!pickTargetFor && (
        <div className="pkg-list">
          {items.map((it) => {
            const usable = mode === 'battle' || it.kind === 'heal';
            return (
              <button
                key={it.id}
                className={`pkg-item ${!usable ? 'pkg-disabled' : ''}`}
                onClick={() => usable && clickItem(it)}
                disabled={!usable}
              >
                <span className={`pkg-icon ${it.kind === 'ball' ? 'pkg-ball' : 'pkg-potion'}`} />
                <span className="pkg-item-info">
                  <span className="pkg-item-name">{it.name} <b>×{it.count}</b></span>
                  <span className="pkg-item-desc">
                    {it.kind === 'ball' && mode === 'overworld' ? 'Can only be used in battle.' : it.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {pickTargetFor && (
        <div className="pkg-targets">
          <div className="pkg-target-head">
            Use {pickTargetFor.name} on…
            <button className="pkp-close" onClick={() => setPickTargetFor(null)}>◀ BACK</button>
          </div>
          {party.map((mon) => {
            const max = mon.MaxHp || 20;
            const full = (mon.Hp ?? 0) >= max;
            return (
              <button
                key={mon.Id}
                className={`pkg-target ${full ? 'pkg-disabled' : ''}`}
                disabled={full}
                onClick={() => { onUseItem(pickTargetFor.id, mon.Id); setPickTargetFor(null); }}
              >
                <img src={staticSprite(mon.Species)} alt={mon.Species} />
                <span className="pkg-target-info">
                  <span>{(mon.Nickname || mon.Species).toUpperCase()} <small>Lv{mon.Level}</small></span>
                  <span className="pkb-hp-row">
                    <span className="pkb-hp-tag">HP</span>
                    <span className="pkb-hp-track">
                      <span
                        className={`pkb-hp-fill ${(mon.Hp / max) > 0.5 ? 'hp-green' : (mon.Hp / max) > 0.2 ? 'hp-yellow' : 'hp-red'}`}
                        style={{ width: `${Math.min(100, (mon.Hp / max) * 100)}%` }}
                      />
                    </span>
                    <span className="pkg-hp-num">{mon.Hp}/{max}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
