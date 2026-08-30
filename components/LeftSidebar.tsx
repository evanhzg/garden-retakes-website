"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AvatarPlayer = {
  steamId: string;
  name: string;
  avatarSrc: string;
};

export default function LeftSidebar({ 
  players, 
  host = "retakes.fr", 
  protocol = "https" 
}: { 
  players: AvatarPlayer[], 
  host?: string, 
  protocol?: string 
}) {
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

  /**
   * A link, as typed.
   *
   * The subdomain rewriting here only ever applied to /games, /docs and
   * /pkmn, and its own comment said this sidebar links to main-domain paths
   * like /players/id. Those three sections moved out to ~/projects, so every
   * branch of it was unreachable — and unreachable host-rewriting is how
   * somebody ends up sent to a hostname that does not resolve.
   */
  const getHref = (path: string) => path;

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
        let dotBg = "#71717a";
        let dotShadow = "none";
        if (liveStatus) {
           if (liveStatus.team === "Spectator" || liveStatus.team === "1") {
             dotBg = "#f97316";
             dotShadow = "0 0 8px rgba(249,115,22,0.8)";
           } else {
             dotBg = "#10b981";
             dotShadow = "0 0 8px rgba(16,185,129,0.8)";
           }
        }

        return (
          <Link key={p.steamId} href={getHref(`/players/${p.steamId}`)} title={p.name} className="ls-avatar-link">
            <div 
              style={{ 
                position: 'absolute', top: 0, right: 0, width: '14px', height: '14px', 
                borderRadius: '50%', border: '2px solid #18181b', zIndex: 20,
                backgroundColor: dotBg, boxShadow: dotShadow,
                transform: 'translate(25%, -25%)', transition: 'background-color 0.5s ease'
              }} 
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.avatarSrc} alt={p.name} className="ls-avatar-img" />
          </Link>
        );
      })}
    </aside>
  );
}
