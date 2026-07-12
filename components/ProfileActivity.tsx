"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/stats";

export default function ProfileActivity({ steamId, lastConnectedUtc }: { steamId: string, lastConnectedUtc?: Date | null }) {
  const [livePlayers, setLivePlayers] = useState<{ steamId: string, team: string }[] | null>(null);

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

  const playerLive = livePlayers?.find(p => p.steamId === steamId);
  
  if (!livePlayers) return null; // loading

  if (playerLive) {
    if (playerLive.team === "Spectator" || playerLive.team === "1") {
      return (
        <div className="activity-indicator">
          <span className="dot idle"></span>
          Idle (Spectating)
        </div>
      );
    } else {
      return (
        <div className="activity-indicator">
          <span className="dot online"></span>
          Playing online
        </div>
      );
    }
  }

  // Offline
  const lastSeenStr = lastConnectedUtc 
    ? `Last seen ${formatDate(lastConnectedUtc)}`
    : "Offline";

  return (
    <div className="activity-indicator">
      <span className="dot offline"></span>
      {lastSeenStr}
    </div>
  );
}
