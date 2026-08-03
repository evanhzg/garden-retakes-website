import React from 'react';
import { staticSprite } from './sprites';
import './pkmn.css';
import { getT } from '@/lib/serverI18n';

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
    const t = getT();

  return (
    <div className="pkp-overlay">
      <div className="pkp-head">
        <h2>{t("auto.partymenu.pok_mon_party")}</h2>
        <button className="pkp-close" onClick={onClose}>{t("auto.partymenu.close")}</button>
      </div>

      <div className="pkp-grid">
        {party.map((mon, i) => {
          const moves: string[] = (() => {
            try { return JSON.parse(mon.Moves || "[]"); } catch { return []; }
          })();
          const maxHp = mon.MaxHp || 20;
          const ratio = Math.min(1, (mon.Hp ?? 0) / maxHp);
          return (
            <div key={mon.Id} className="pkp-card">
              <img src={staticSprite(mon.Species)} alt={mon.Species} />
              <div className="pkp-info">
                <div className="pkp-name">
                  <span>{(mon.Nickname || mon.Species).toUpperCase()}</span>
                  <span style={{ color: '#555' }}>{t("auto.partymenu.lv")}{mon.Level}</span>
                </div>
                <div className="pkb-hp-row">
                  <span className="pkb-hp-tag">{t("auto.partymenu.hp")}</span>
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
                <button className="pkp-switch" onClick={() => onSwitch?.(i + 1)}>{t("auto.partymenu.switch")}</button>
              )}
            </div>
          );
        })}
      </div>

      {party.length === 0 && (
        <p style={{ textAlign: 'center', color: '#cbb8e0', marginTop: 32 }}>{t("auto.partymenu.your_party_is_empty")}</p>
      )}
    </div>
  );
}
