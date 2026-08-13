"use client";

import { useEffect, useState } from "react";

export default function AllstarConnect() {
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [sync, setSync] = useState(true);
  const [initialSync, setInitialSync] = useState(true);
  const [initialUsername, setInitialUsername] = useState("");

  const load = () => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setUsername(data.allstarUsername || "");
        setInitialUsername(data.allstarUsername || "");
        setSync(data.allstarSync !== false);
        setInitialSync(data.allstarSync !== false);
      })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allstarUsername: username, allstarSync: sync })
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const hasChanges = username !== initialUsername || sync !== initialSync;

  return (
    <div className="discord-connect" style={{ flexDirection: "column", alignItems: "stretch", gap: 16 }}>
      <div className="discord-connect-head" style={{ alignItems: "flex-start" }}>
        <span className="discord-glyph" aria-hidden style={{ backgroundColor: "#2e2e38", borderRadius: 4, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold", fontSize: 16 }}>
          ★
        </span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 4px" }}>Allstar.gg</h3>
          <p style={{ margin: 0, fontSize: 14, color: "var(--color-muted)" }}>
            Connect your Allstar account to automatically import clips to the feed.
          </p>
        </div>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 14, fontWeight: 500 }}>Allstar Username</label>
        <input 
          type="text" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
          placeholder="e.g. S1mple" 
          className="text-input" 
          disabled={busy} 
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input 
          type="checkbox" 
          id="allstar-sync" 
          checked={sync} 
          onChange={(e) => setSync(e.target.checked)} 
          disabled={busy} 
        />
        <label htmlFor="allstar-sync" style={{ fontSize: 14 }}>Auto-import new clips</label>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button 
          className="btn btn-primary" 
          onClick={save} 
          disabled={busy || !hasChanges}
        >
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
