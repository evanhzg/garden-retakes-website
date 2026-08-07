import { useState, useEffect } from "react";
import "@/app/lobby/retakes-lobby.css";

// Mock interface for live match
type LiveMatch = {
  id: string;
  mode: string;
  map: string;
  teamA: { name: string; score: number; players: { name: string; kills: number; deaths: number }[] };
  teamB: { name: string; score: number; players: { name: string; kills: number; deaths: number }[] };
  duration: number;
};

export default function LiveGames() {
  const [games, setGames] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Mocking fetch
  useEffect(() => {
    setTimeout(() => {
      setGames([
        {
          id: "m1",
          mode: "2v2",
          map: "de_mirage",
          duration: 360,
          teamA: {
            name: "Team Alpha",
            score: 7,
            players: [
              { name: "Player1", kills: 12, deaths: 4 },
              { name: "Player2", kills: 8, deaths: 6 },
            ],
          },
          teamB: {
            name: "Team Bravo",
            score: 5,
            players: [
              { name: "Player3", kills: 9, deaths: 9 },
              { name: "Player4", kills: 4, deaths: 11 },
            ],
          },
        },
        {
          id: "m2",
          mode: "3v3",
          map: "de_inferno",
          duration: 1200,
          teamA: {
            name: "Team Charlie",
            score: 12,
            players: [
              { name: "Player5", kills: 20, deaths: 10 },
              { name: "Player6", kills: 15, deaths: 12 },
              { name: "Player7", kills: 10, deaths: 15 },
            ],
          },
          teamB: {
            name: "Team Delta",
            score: 11,
            players: [
              { name: "Player8", kills: 18, deaths: 13 },
              { name: "Player9", kills: 14, deaths: 14 },
              { name: "Player10", kills: 11, deaths: 16 },
            ],
          },
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Loading live games...</div>;
  }

  if (games.length === 0) {
    return <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No live games currently playing.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {games.map((game) => (
        <div key={game.id} style={{
          background: "var(--rq-panel)",
          border: "1px solid var(--rq-edge)",
          borderRadius: "14px",
          overflow: "hidden"
        }}>
          <div style={{
            background: "color-mix(in srgb, var(--color-text) 5%, transparent)",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--rq-edge)"
          }}>
            <div style={{ fontWeight: "bold", fontSize: "14px", color: "var(--color-accent)" }}>Live • {game.mode}</div>
            <div style={{ fontSize: "13px", color: "var(--muted)" }}>{game.map}</div>
            <div style={{ fontSize: "13px", color: "var(--muted)" }}>{Math.floor(game.duration / 60)}:{(game.duration % 60).toString().padStart(2, "0")}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "20px", padding: "16px" }}>
            {/* Team A */}
            <div>
              <div style={{ fontWeight: "bold", marginBottom: "10px", fontSize: "15px" }}>{game.teamA.name}</div>
              <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--rq-edge)" }}>
                    <th style={{ padding: "4px" }}>Player</th>
                    <th style={{ padding: "4px", textAlign: "right" }}>K</th>
                    <th style={{ padding: "4px", textAlign: "right" }}>D</th>
                  </tr>
                </thead>
                <tbody>
                  {game.teamA.players.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid color-mix(in srgb, var(--rq-edge) 50%, transparent)" }}>
                      <td style={{ padding: "6px 4px" }}>{p.name}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>{p.kills}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", color: "var(--muted)" }}>{p.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Score */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: "32px", fontWeight: "900", display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ color: game.teamA.score > game.teamB.score ? "var(--color-accent)" : "inherit" }}>{game.teamA.score}</span>
                <span style={{ color: "var(--muted)", fontSize: "20px" }}>-</span>
                <span style={{ color: game.teamB.score > game.teamA.score ? "var(--color-accent)" : "inherit" }}>{game.teamB.score}</span>
              </div>
            </div>

            {/* Team B */}
            <div>
              <div style={{ fontWeight: "bold", marginBottom: "10px", fontSize: "15px", textAlign: "right" }}>{game.teamB.name}</div>
              <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "right", borderBottom: "1px solid var(--rq-edge)" }}>
                    <th style={{ padding: "4px" }}>Player</th>
                    <th style={{ padding: "4px" }}>K</th>
                    <th style={{ padding: "4px" }}>D</th>
                  </tr>
                </thead>
                <tbody>
                  {game.teamB.players.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid color-mix(in srgb, var(--rq-edge) 50%, transparent)" }}>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>{p.name}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>{p.kills}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", color: "var(--muted)" }}>{p.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
