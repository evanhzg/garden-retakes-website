"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AvatarPlayer = {
  steamId: string;
  name: string;
  avatarSrc: string;
};

export default function LeftSidebar({ players }: { players: AvatarPlayer[] }) {
  const [livePlayers, setLivePlayers] = useState<{ steamId: string, team: string }[]>([]);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const json = await res.json();
          if (json.live && json.data?.Players) {
            setLivePlayers(json.data.Players.map((p: any) => ({ steamId: p.SteamId, team: p.Team })));
            return;
          }
        }
        setLivePlayers([]);
      } catch (err) {
        setLivePlayers([]);
      }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
  }, []);

  if (players.length === 0) return null;

  const sortedPlayers = [...players].sort((a, b) => {
    const aLive = livePlayers.find(p => p.steamId === a.steamId);
    const bLive = livePlayers.find(p => p.steamId === b.steamId);
    
    const getWeight = (live?: {steamId: string, team: string}) => {
      if (!live) return 0;
      if (live.team === "Spectator" || live.team === "1") return 1;
      return 2;
    };

    const wA = getWeight(aLive);
    const wB = getWeight(bLive);

    if (wA !== wB) return wB - wA; // 2 (Playing) > 1 (Spectating) > 0 (Offline)
    return a.name.localeCompare(b.name);
  });

  return (
    <aside className="left-sidebar">
      {sortedPlayers.map((p) => {
        const liveStatus = livePlayers.find(lp => lp.steamId === p.steamId);
        let dotColor = "bg-zinc-500 shadow-none";
        if (liveStatus) {
           if (liveStatus.team === "Spectator" || liveStatus.team === "1") {
             dotColor = "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]";
           } else {
             dotColor = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]";
           }
        }

        return (
          <Link key={p.steamId} href={isNaN(Number(p.steamId)) ? `/pros/${p.steamId}` : `/players/${p.steamId}`} title={p.name} className="ls-avatar-link relative inline-block">
            <div className={`absolute top-0 right-0 w-3.5 h-3.5 rounded-full border-[2px] border-[#18181b] z-20 ${dotColor} transition-colors duration-500`} style={{ transform: 'translate(25%, -25%)' }} />
            <img src={p.avatarSrc} alt={p.name} className="w-full h-full object-cover relative z-10 rounded-lg" />
          </Link>
        );
      })}
    </aside>
  );
}
