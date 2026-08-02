"use client";

import { useCallback, useEffect, useState } from "react";

// What the highlight pipeline has waiting for it.
//
// Read-only on purpose: the pipeline is the thing that acts on these, and a
// "process now" button here would be a lie — the work happens on whichever
// machine has CS2 and HLAE, not on the server.

type PendingDemo = {
  id: number;
  fileName: string;
  uploader: string;
  uploaderSteamId: string;
  focusSteamId: string | null;
  rounds: string | null;
  bytes: number | null;
  status: string;
  createdAt: string;
};

const mb = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(0)} MB` : "—");

export default function PendingDemos({ adminKey }: { adminKey?: string }) {
  const [demos, setDemos] = useState<PendingDemo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/feed/demos/pending${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load the queue.");
        setDemos([]);
        return;
      }
      setDemos(json.demos ?? []);
    } catch {
      setError("Could not reach the server.");
      setDemos([]);
    }
  }, [adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <p className="skin-note skin-note-warn" role="alert">
        <span><strong>Queue unavailable.</strong> {error}</span>
      </p>
    );
  }
  if (demos === null) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="pro-section-head" style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: 15 }}>Demos waiting for the pipeline</h2>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {demos.length === 0 ? (
        <div className="empty-hint">
          <p style={{ margin: 0 }}>Nothing queued.</p>
          <p className="muted" style={{ fontSize: 13 }}>
            Demos uploaded on the feed appear here until the pipeline collects them.
          </p>
        </div>
      ) : (
        <div className="pro-tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Demo</th>
                <th scope="col">Uploader</th>
                <th scope="col">Wanted</th>
                <th scope="col" className="r">Size</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.fileName}</strong>
                    <div className="adm-steamid num">
                      {new Date(d.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td>
                    <a href={`/players/${d.uploaderSteamId}`} className="adm-pname">{d.uploader}</a>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {d.rounds ? `rounds ${d.rounds}` : "every highlight"}
                    {d.focusSteamId && d.focusSteamId !== d.uploaderSteamId ? ` · player ${d.focusSteamId}` : ""}
                  </td>
                  <td className="r num">{mb(d.bytes)}</td>
                  <td>
                    <span className={`tag ${d.status === "processing" ? "tag-accent" : "tag-neutral"}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pro-section-note" style={{ marginTop: "var(--space-4)" }}>
        Run <code>.\run.cmd</code> on the machine with CS2 to collect and cut these. Demos are deleted
        from storage once their clips are published.
      </p>
    </>
  );
}
