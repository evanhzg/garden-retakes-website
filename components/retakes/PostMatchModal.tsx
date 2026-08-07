import { useState } from "react";
import "@/app/lobby/retakes-lobby.css";

type Teammate = { steamId: string; name: string; kills: number; deaths: number; rating: number; eloChange: number; elo: number };

type PostMatchProps = {
  matchId: string;
  myTeamScore: number;
  enemyTeamScore: number;
  teammates: Teammate[];
  onClose: () => void;
};

export default function PostMatchModal({ matchId, myTeamScore, enemyTeamScore, teammates, onClose }: PostMatchProps) {
  const [votes, setVotes] = useState<Record<string, { toxicity: number, safeness: number, communication: number, teamplay: number }>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleVoteChange = (steamId: string, category: string, value: number) => {
    setVotes(prev => ({
      ...prev,
      [steamId]: {
        ...(prev[steamId] || { toxicity: 50, safeness: 50, communication: 50, teamplay: 50 }),
        [category]: value
      }
    }));
  };

  const submitVotes = async () => {
    try {
      await fetch("/api/match/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, votes })
      });
      setSubmitted(true);
    } catch (e) {
      console.error("Failed to submit votes", e);
    }
  };

  const won = myTeamScore > enemyTeamScore;
  const draw = myTeamScore === enemyTeamScore;

  return (
    <div className="rq-takeover">
      <div className="rq-found" style={{ maxWidth: "600px", width: "100%", padding: "40px" }}>
        <h2 style={{ fontSize: "32px", margin: "0 0 10px 0", color: won ? "var(--color-accent)" : draw ? "var(--muted)" : "#E0533A" }}>
          {won ? "VICTORY" : draw ? "DRAW" : "DEFEAT"}
        </h2>
        <div style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "30px" }}>
          {myTeamScore} - {enemyTeamScore}
        </div>

        <div style={{ width: "100%", marginBottom: "30px" }}>
          <h3 style={{ fontSize: "16px", textTransform: "uppercase", color: "var(--muted)", marginBottom: "10px", textAlign: "left" }}>Your Team</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--rq-edge)", color: "var(--muted)" }}>
                <th style={{ padding: "8px 4px" }}>Player</th>
                <th style={{ padding: "8px 4px" }}>K-D</th>
                <th style={{ padding: "8px 4px" }}>Rating</th>
                <th style={{ padding: "8px 4px", textAlign: "right" }}>ELO</th>
              </tr>
            </thead>
            <tbody>
              {teammates.map(t => (
                <tr key={t.steamId} style={{ borderBottom: "1px solid color-mix(in srgb, var(--rq-edge) 50%, transparent)" }}>
                  <td style={{ padding: "10px 4px", fontWeight: "bold" }}>{t.name}</td>
                  <td style={{ padding: "10px 4px", color: "var(--muted)" }}>{t.kills}-{t.deaths}</td>
                  <td style={{ padding: "10px 4px" }}>{t.rating.toFixed(2)}</td>
                  <td style={{ padding: "10px 4px", textAlign: "right" }}>
                    {t.elo} <span style={{ color: t.eloChange >= 0 ? "#6fcf7f" : "#E0533A", fontSize: "12px", marginLeft: "4px" }}>
                      {t.eloChange >= 0 ? "+" : ""}{t.eloChange}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!submitted ? (
          <div style={{ width: "100%", textAlign: "left", marginBottom: "30px" }}>
            <h3 style={{ fontSize: "16px", textTransform: "uppercase", color: "var(--muted)", marginBottom: "10px" }}>Rate Teammates</h3>
            {teammates.map(t => (
              <div key={`vote-${t.steamId}`} style={{ marginBottom: "20px", background: "color-mix(in srgb, var(--color-text) 5%, transparent)", padding: "16px", borderRadius: "12px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "10px" }}>{t.name}</div>
                {['toxicity', 'safeness', 'communication', 'teamplay'].map(cat => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "13px", textTransform: "capitalize", width: "100px" }}>{cat}</span>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={votes[t.steamId]?.[cat as keyof typeof votes[string]] ?? 50} 
                      onChange={(e) => handleVoteChange(t.steamId, cat, parseInt(e.target.value))}
                      style={{ flex: 1, margin: "0 10px", accentColor: "var(--color-accent)" }}
                    />
                    <span style={{ fontSize: "12px", width: "30px", textAlign: "right" }}>{votes[t.steamId]?.[cat as keyof typeof votes[string]] ?? 50}</span>
                  </div>
                ))}
              </div>
            ))}
            <button className="btn btn-primary" style={{ width: "100%", padding: "12px" }} onClick={submitVotes}>
              Submit Ratings
            </button>
          </div>
        ) : (
          <div style={{ width: "100%", padding: "20px", textAlign: "center", color: "#6fcf7f", fontWeight: "bold", background: "color-mix(in srgb, #6fcf7f 10%, transparent)", borderRadius: "12px", marginBottom: "30px" }}>
            Ratings submitted. Thank you!
          </div>
        )}

        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
