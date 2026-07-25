"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import "./ladder.css";

type Stat = {
  steamId: string;
  name: string;
  gameId: string;
  matchesPlayed: number;
  matchesWon: number;
  totalScore: number;
  elo: number;
};

export default function GamesLadderPage() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/games/ladder?gameId=${filter}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setStats(data);
        else setStats([]);
      })
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="ladder-page">
      <header className="ladder-header">
        <Link href="/games" className="back-link">← Back to Hub</Link>
        <h1>Games Ladder</h1>
        <p>Top players across all web games</p>
      </header>
      
      <div className="ladder-filters">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All Games</button>
        <button className={filter === "monopoly" ? "active" : ""} onClick={() => setFilter("monopoly")}>Monopoly</button>
        <button className={filter === "uno" ? "active" : ""} onClick={() => setFilter("uno")}>Ouno</button>
        <button className={filter === "skribbl" ? "active" : ""} onClick={() => setFilter("skribbl")}>Free-Draw</button>
        <button className={filter === "meme" ? "active" : ""} onClick={() => setFilter("meme")}>Meme</button>
        <button className={filter === "codenames" ? "active" : ""} onClick={() => setFilter("codenames")}>Codenames</button>
        <button className={filter === "cah" ? "active" : ""} onClick={() => setFilter("cah")}>Pile Of...</button>
        <button className={filter === "headshot" ? "active" : ""} onClick={() => setFilter("headshot")}>Headshot</button>
      </div>

      <div className="ladder-table-container glass-panel">
        {loading ? (
          <div className="ladder-loading"><div className="loader" /></div>
        ) : stats.length === 0 ? (
          <div className="ladder-empty">No stats available yet. Go play some games!</div>
        ) : (
          <table className="ladder-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                {filter === "all" && <th>Game</th>}
                <th>Elo</th>
                <th>Win Rate</th>
                <th>Matches</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => {
                const wr = s.matchesPlayed > 0 ? Math.round((s.matchesWon / s.matchesPlayed) * 100) : 0;
                return (
                  <tr key={`${s.steamId}-${s.gameId}`}>
                    <td className="rank-cell">#{i + 1}</td>
                    <td className="name-cell">
                      <Link href={`/profile/${s.steamId}`}>{s.name}</Link>
                    </td>
                    {filter === "all" && <td className="game-cell">{s.gameId.toUpperCase()}</td>}
                    <td className="elo-cell">{s.elo}</td>
                    <td className="wr-cell">{wr}%</td>
                    <td className="matches-cell">{s.matchesWon} / {s.matchesPlayed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
