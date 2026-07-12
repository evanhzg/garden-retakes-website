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
    <div>
      <div className="flex gap-4 mb-6">
        <select 
          className="input flex-1"
          value={map.id} 
          onChange={e => setMap(MAPS.find(m => m.id === e.target.value)!)}
        >
          {MAPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        
        <select 
          className="input flex-1"
          value={steamId}
          onChange={e => setSteamId(e.target.value)}
        >
          <option value="default">Server Default (Top 5 Avg Retake Spots)</option>
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

      <div className="relative w-full max-w-[1024px] aspect-square mx-auto rounded-xl overflow-hidden border border-zinc-800 shadow-xl bg-black">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm text-emerald-400 font-bold animate-pulse">
            Loading analytics...
          </div>
        )}
        <Image
          src={`/maps/${map.id}.png`}
          alt={map.name}
          fill
          className="object-contain z-0 opacity-80"
          unoptimized
        />
        <canvas
          ref={canvasRef}
          width={1024}
          height={1024}
          className="absolute inset-0 z-10 w-full h-full pointer-events-none"
        />
      </div>

      <div className="flex gap-6 justify-center mt-6 text-sm font-semibold text-zinc-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-emerald-400 opacity-70 border border-black/50" />
          Kills
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-400 opacity-70 border border-black/50" />
          Deaths
        </div>
      </div>
    </div>
  );
}
