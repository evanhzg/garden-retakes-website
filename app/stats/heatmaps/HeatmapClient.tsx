"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type MapData = {
  id: string;
  name: string;
  scale: number;
  xOffset: number;
  yOffset: number;
};

const MAPS: MapData[] = [
  { id: "de_mirage", name: "Mirage", scale: 5, xOffset: -3230, yOffset: 1713 },
  { id: "de_dust2", name: "Dust II", scale: 4.4, xOffset: -2400, yOffset: 3383 },
  { id: "de_inferno", name: "Inferno", scale: 4.9, xOffset: -2087, yOffset: 3870 },
];

export default function HeatmapClient({ users }: { users: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [map, setMap] = useState<MapData>(MAPS[0]);
  const [steamId, setSteamId] = useState<string>("default");
  const [points, setPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats/heatmaps?map=${map.id}&steamId=${steamId}`)
      .then(res => res.json())
      .then(data => {
        setPoints(data.points || []);
        setLoading(false);
      });
  }, [map.id, steamId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of points) {
      // Coordinate translation based on CS2 radar metadata
      const px = (p.VictimX - map.xOffset) / map.scale;
      const py = (map.yOffset - p.VictimY) / map.scale;

      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = p.Type === "Kill" ? "rgba(74, 222, 128, 0.7)" : "rgba(248, 113, 113, 0.7)";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke();

      if (p.Site) {
        ctx.fillStyle = "white";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(p.Site, px - 4, py + 4);
      }
    }
  }, [points, map]);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '24px', minWidth: '300px', maxWidth: '400px' }}>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Analysis Controls</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Map</label>
            <select 
              className="input"
              style={{ width: '100%' }}
              value={map.id} 
              onChange={e => setMap(MAPS.find(m => m.id === e.target.value)!)}
            >
              {MAPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Player Focus</label>
            <select 
              className="input"
              style={{ width: '100%' }}
              value={steamId}
              onChange={e => setSteamId(e.target.value)}
            >
              <option value="default">Server Default (Top Spots)</option>
              <option value="ZywOo">ZywOo (Demo Data)</option>
              <optgroup label="Players">
                {users.map(u => (
                  <option key={u.SteamId.toString()} value={u.SteamId.toString()}>
                    {u.Name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Legend</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.875rem', fontWeight: 600, color: '#d4d4d8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#34d399', border: '1px solid rgba(0,0,0,0.5)', boxShadow: '0 0 8px rgba(52,211,153,0.4)' }} />
              Kill Position
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#f87171', border: '1px solid rgba(0,0,0,0.5)', boxShadow: '0 0 8px rgba(248,113,113,0.4)' }} />
              Death Position
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: '2 1 500px', width: '100%', maxWidth: '800px', margin: '0 auto' }}>
        <div 
          style={{ 
            position: 'relative', 
            width: '100%', 
            paddingTop: '100%', /* 1:1 aspect ratio */
            borderRadius: '16px', 
            overflow: 'hidden', 
            border: '2px solid var(--border)', 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', 
            backgroundColor: '#000' 
          }}
        >
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: 'var(--accent)', fontWeight: 'bold' }}>
                Computing Densities...
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            <Image
              src={`/maps/${map.id}.png`}
              alt={map.name}
              fill
              style={{ objectFit: 'contain', opacity: 0.7, mixBlendMode: 'screen', pointerEvents: 'none' }}
              unoptimized
            />
          </div>
          <canvas
            ref={canvasRef}
            width={1024}
            height={1024}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: 'none', objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
}
