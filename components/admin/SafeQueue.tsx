"use client";

import { useEffect, useState } from "react";

type Request = {
  id: number;
  steamId: string;
  name: string;
  discordId: string;
  motivation: string;
  gender: string;
  createdAt: string;
  safeScore: number;
  toxicityScore: number;
  teamplayScore: number;
};

export default function SafeQueue({ adminKey }: { adminKey?: string }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/safe-queue${adminKey ? `?key=${adminKey}` : ""}`)
      .then(r => r.json())
      .then(d => setRequests(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [adminKey]);

  const act = async (id: number, action: string) => {
    if (!confirm(`Are you sure you want to ${action} this request?`)) return;
    const res = await fetch(`/api/admin/safe-queue${adminKey ? `?key=${adminKey}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action })
    });
    if (res.ok) load();
  };

  if (loading) return <p className="muted">Loading requests...</p>;
  if (requests.length === 0) return <p className="empty-hint">No pending Safe Queue requests.</p>;

  return (
    <div className="adm-scroll">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Discord</th>
            <th scope="col">Motivation & Gender</th>
            <th scope="col">Scores (Safe / Tox / Team)</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(req => (
            <tr key={req.id}>
              <td>
                <a href={`/players/${req.steamId}`} className="adm-pname">{req.name}</a>
                <div className="adm-steamid num">{req.steamId}</div>
                <div className="muted">{new Date(req.createdAt).toLocaleString()}</div>
              </td>
              <td>{req.discordId}</td>
              <td style={{ maxWidth: 300, whiteSpace: "normal" }}>
                <strong>Gender:</strong> {req.gender}
                <br/>
                <div style={{ marginTop: 8 }}>{req.motivation}</div>
              </td>
              <td>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div title="Safeness" style={{ padding: 4, background: "#2ecc71", color: "#fff", borderRadius: 4 }}>{req.safeScore}</div>
                  <div title="Toxicity" style={{ padding: 4, background: "#e74c3c", color: "#fff", borderRadius: 4 }}>{req.toxicityScore}</div>
                  <div title="Teamplay" style={{ padding: 4, background: "#3498db", color: "#fff", borderRadius: 4 }}>{req.teamplayScore}</div>
                </div>
              </td>
              <td>
                <div className="adm-actions">
                  <button className="btn btn-secondary" onClick={() => act(req.id, "APPROVE_PROBATION")}>Approve (Probation)</button>
                  <button className="btn btn-secondary" onClick={() => act(req.id, "APPROVE_PERMANENT")}>Approve (Permanent)</button>
                  <button className="btn btn-secondary" style={{ color: "#e74c3c" }} onClick={() => act(req.id, "REJECT")}>Reject</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
