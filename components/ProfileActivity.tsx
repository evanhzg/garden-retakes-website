"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/stats";

function formatMapName(map: string) {
  if (!map) return "Unknown";
  let name = map.startsWith("de_") ? map.slice(3) : map;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function ProfileActivity({ steamId, lastConnectedUtc }: { steamId: string, lastConnectedUtc?: Date | null }) {
  const [liveData, setLiveData] = useState<{ players: { steamId: string, team: string }[], map: string, mode: string } | null>(null);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const json = await res.json();
          if (json.live && json.data?.Players) {
            setLiveData({
              players: json.data.Players.map((p: any) => ({ steamId: p.SteamId, team: p.Team })),
              map: json.data.Map,
              mode: json.data.Mode
            });
            return;
          }
        }
        setLiveData({ players: [], map: "", mode: "" });
      } catch (err) {
        setLiveData({ players: [], map: "", mode: "" });
      }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
  }, []);

  const playerLive = liveData?.players.find(p => p.steamId === steamId);
  
  if (!liveData) return null; // loading

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
          Playing {liveData.mode} on {formatMapName(liveData.map)}
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
