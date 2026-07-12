'use client';

import { useState, useEffect } from 'react';

type HeatmapPoint = {
  Id: string;
  VictimSteamId: string;
  AttackerSteamId: string;
  MapName: string;
  VictimX: number;
  VictimY: number;
  VictimZ: number;
  AttackerX: number;
  AttackerY: number;
  AttackerZ: number;
  Weapon: string;
  IsHeadshot: boolean;
  CreatedAtUtc: string;
};

// CS2 Map Radar Metadata (pos_x, pos_y, scale)
// Derived from standard cs2 radar files
const MAP_META: Record<string, { x: number, y: number, scale: number }> = {
  de_mirage: { x: -3230, y: 1713, scale: 5.0 },
  de_dust2: { x: -2400, y: 3383, scale: 4.4 },
  de_inferno: { x: -2087, y: 3870, scale: 4.9 },
  de_nuke: { x: -3453, y: 2887, scale: 7.0 },
  de_vertigo: { x: -3168, y: 1762, scale: 4.0 },
  de_overpass: { x: -4831, y: 1781, scale: 5.2 },
  de_ancient: { x: -2953, y: 2164, scale: 5.0 },
  de_anubis: { x: -2796, y: 3328, scale: 5.2 },
};

export default function HeatmapsPage() {
  const [steamId, setSteamId] = useState('');
  const [mapName, setMapName] = useState('de_mirage');
  const [data, setData] = useState<HeatmapPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const [showKills, setShowKills] = useState(true);
  const [showDeaths, setShowDeaths] = useState(true);

  const fetchHeatmap = async () => {
    if (!steamId || !mapName) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stats/heatmaps?steamId=${steamId}&mapName=${mapName}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const meta = MAP_META[mapName] || { x: -3000, y: 3000, scale: 5.0 };
  const radarSize = 1024; // Base image resolution logic

  const getPos = (worldX: number, worldY: number) => {
    // PixelX = (worldX - pos_x) / scale
    // PixelY = (pos_y - worldY) / scale
    const px = (worldX - meta.x) / meta.scale;
    const py = (meta.y - worldY) / meta.scale;
    // Map to percentage of container
    return {
      left: `${(px / radarSize) * 100}%`,
      top: `${(py / radarSize) * 100}%`
    };
  };

  return (
    <div className="container">
      <div className="hero">
        <h1>Player Heatmaps</h1>
        <p className="subtitle">Visualize kill and death locations.</p>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>SteamID64</label>
            <input 
              className="input" 
              placeholder="7656119..." 
              value={steamId} 
              onChange={e => setSteamId(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Map</label>
            <select className="input" value={mapName} onChange={e => setMapName(e.target.value)}>
              {Object.keys(MAP_META).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={fetchHeatmap} disabled={loading || !steamId}>
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#10b981', fontWeight: 'bold' }}>
            <input type="checkbox" checked={showKills} onChange={e => setShowKills(e.target.checked)} />
            Show Kills
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }}>
            <input type="checkbox" checked={showDeaths} onChange={e => setShowDeaths(e.target.checked)} />
            Show Deaths
          </label>
        </div>
      </div>

      <div className="panel" style={{ display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <div 
          style={{ 
            position: 'relative', 
            width: '100%', 
            maxWidth: 800, 
            aspectRatio: '1/1', 
            background: `url(/maps/${mapName}.png) center/cover no-repeat, #14100f`,
            borderRadius: 12,
            border: '1px solid var(--border)'
          }}
        >
          {data.map(p => {
            const isKill = p.AttackerSteamId === steamId;
            if (isKill && !showKills) return null;
            if (!isKill && !showDeaths) return null;

            // If it's a kill, we show where the ENEMY (victim) was when we killed them, OR where WE were?
            // Usually heatmaps show where the action happened. Let's plot our own position when the event occurred.
            const worldX = isKill ? p.AttackerX : p.VictimX;
            const worldY = isKill ? p.AttackerY : p.VictimY;

            const pos = getPos(worldX, worldY);

            return (
              <div 
                key={p.Id}
                style={{
                  position: 'absolute',
                  left: pos.left,
                  top: pos.top,
                  width: 8,
                  height: 8,
                  background: isKill ? '#10b981' : '#ef4444',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: `0 0 8px ${isKill ? '#10b981' : '#ef4444'}`,
                  opacity: 0.8
                }}
                title={`${isKill ? 'Killed' : 'Died to'} ${p.Weapon}`}
              />
            );
          })}
          
          {data.length === 0 && !loading && steamId && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              No data found for this player on {mapName}.
            </div>
          )}
          {!steamId && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              Enter a SteamID to load heatmaps.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
