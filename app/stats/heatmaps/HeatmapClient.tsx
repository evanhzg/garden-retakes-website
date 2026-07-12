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
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
        <div className="panel flex flex-col gap-4">
          <h3 className="font-bold text-lg border-b border-zinc-800 pb-2">Analysis Controls</h3>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Map</label>
            <select 
              className="input w-full"
              value={map.id} 
              onChange={e => setMap(MAPS.find(m => m.id === e.target.value)!)}
            >
              {MAPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Player Focus</label>
            <select 
              className="input w-full"
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

        <div className="panel flex flex-col gap-4">
          <h3 className="font-bold text-lg border-b border-zinc-800 pb-2">Legend</h3>
          <div className="flex flex-col gap-3 text-sm font-semibold text-zinc-300">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-emerald-400 opacity-80 border border-black/50 shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
              Kill Position
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-red-400 opacity-80 border border-black/50 shadow-[0_0_8px_rgba(248,113,113,0.4)]" />
              Death Position
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-[800px] mx-auto">
        <div 
          className="relative w-full rounded-2xl overflow-hidden border-2 border-[var(--border)] shadow-2xl bg-black"
          style={{ aspectRatio: "1/1", maxHeight: "80vh" }}
        >
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4 text-[var(--accent)] font-bold animate-pulse">
                <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                Computing Densities...
              </div>
            </div>
          )}
          <div className="absolute inset-0 z-0">
            <Image
              src={`/maps/${map.id}.png`}
              alt={map.name}
              fill
              className="object-contain opacity-70 mix-blend-screen pointer-events-none"
              unoptimized
            />
          </div>
          <canvas
            ref={canvasRef}
            width={1024}
            height={1024}
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            style={{ objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
}
