"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/components/I18nProvider";

type RoundRecord = {
  date: string;
  elo: number;
  delta: number;
  rating: number;
  kast: boolean;
  kills: number;
  died: boolean;
};

type CalibratingPlayer = {
  steamId: string;
  name: string;
  roundsPlayed: number;
  rounds: RoundRecord[];
};

export default function CalibrationDashboard() {
  const { t } = useI18n();
  const [players, setPlayers] = useState<CalibratingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/calibration")
      .then(res => res.json())
      .then(data => {
        if (data.players) setPlayers(data.players);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading calibration data...</p>;
  if (players.length === 0) return <p className="empty-hint">No players are currently calibrating.</p>;

  return (
    <div className="adm-calibration">
      {players.map(p => (
        <div key={p.steamId} style={{ marginBottom: "1rem", border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
          <button 
            className="btn" 
            style={{ width: "100%", justifyContent: "space-between", background: "var(--panel-bg)", border: "none", borderRadius: 0, padding: "12px 16px" }}
            onClick={() => setExpanded(expanded === p.steamId ? null : p.steamId)}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <strong>{p.name}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{p.roundsPlayed} / 70 rounds</span>
            </div>
            <span>{expanded === p.steamId ? "▲" : "▼"}</span>
          </button>
          
          {expanded === p.steamId && (
            <div style={{ padding: "16px", maxHeight: "400px", overflowY: "auto", background: "var(--bg)" }}>
              {p.rounds.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No rounds played yet.</p>
              ) : (
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th scope="col">Round</th>
                      <th scope="col">Date</th>
                      <th scope="col">Hidden ELO</th>
                      <th scope="col">Delta</th>
                      <th scope="col">Rating</th>
                      <th scope="col">K/D</th>
                      <th scope="col">KAST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rounds.map((r, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="muted">{new Date(r.date).toLocaleString()}</td>
                        <td><strong>{r.elo}</strong></td>
                        <td style={{ color: r.delta > 0 ? "var(--accent-green)" : r.delta < 0 ? "var(--accent-red)" : "inherit" }}>
                          {r.delta > 0 ? "+" : ""}{r.delta}
                        </td>
                        <td>{r.rating.toFixed(2)}</td>
                        <td>{r.kills} / {r.died ? 1 : 0}</td>
                        <td>{r.kast ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
