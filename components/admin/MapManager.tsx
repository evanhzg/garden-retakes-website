"use client";

import { useEffect, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import { GAME_MODES, RETAKE_FLAVOURS } from "@/lib/gameModes";

type GardenMap = {
  Id: number;
  Mode: string;
  MapName: string;
  ImageUrl: string | null;
  WorkshopId: string | null;
};

function formatMapName(name: string) {
  return name.replace(/^(de_|cs_)/i, "");
}

export default function MapManager({ adminKey }: { adminKey?: string }) {
  const [maps, setMaps] = useState<GardenMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState("retakes");
  const [addInput, setAddInput] = useState("");
  const [addMapName, setAddMapName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMaps = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/maps${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`);
      const data = await res.json();
      if (res.ok) setMaps(data.maps);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaps();
  }, [adminKey]);

  const handleAddMap = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);

    let workshopId = "";
    let finalMapName = addMapName.trim();
    
    // Parse input (could be URL or ID)
    const match = addInput.match(/id=(\d+)/) || addInput.match(/^(\d+)$/);
    if (match) {
      workshopId = match[1];
    } else if (!finalMapName) {
      finalMapName = addInput.trim();
    }

    if (!finalMapName && !workshopId) {
      setError("Please provide a map name or Workshop ID/URL.");
      setAdding(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: adminKey,
          mode: addMode,
          mapName: finalMapName || `workshop/${workshopId}`,
          workshopId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setAddInput("");
        setAddMapName("");
        fetchMaps();
      } else {
        setError(data.error || "Failed to add map.");
      }
    } catch (err) {
      setError("Network error.");
    } finally {
      setAdding(false);
    }
  };

  // Group maps by mode
  const mapsByMode = maps.reduce((acc, map) => {
    if (!acc[map.Mode]) acc[map.Mode] = [];
    acc[map.Mode].push(map);
    return acc;
  }, {} as Record<string, GardenMap[]>);

  const allModes = [...GAME_MODES];

  return (
    <div className="adm-maps">
      {allModes.map((mode) => (
        <div key={mode.id} style={{ marginBottom: "var(--space-5)" }}>
          <h3 style={{ textTransform: "capitalize", marginBottom: "var(--space-3)" }}>{mode.label} Maps</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {mapsByMode[mode.id]?.map((m) => (
              <div key={m.Id} className="map-card" style={{
                width: 160, height: 160, borderRadius: 8, overflow: "hidden", 
                display: "flex", flexDirection: "column", background: "var(--panel)"
              }}>
                <div style={{ height: 80, width: "100%", background: "var(--bg-inset)" }}>
                  {m.ImageUrl ? (
                    <img src={m.ImageUrl} alt={m.MapName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>No Image</div>
                  )}
                </div>
                <div style={{
                  height: 80, width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--accent)", color: "var(--accent-fg, #fff)", fontWeight: "bold", 
                  textTransform: "capitalize", textAlign: "center", padding: 8
                }}>
                  {formatMapName(m.MapName)}
                </div>
              </div>
            ))}
            
            {/* Add Button */}
            <button
              className="map-card-add"
              style={{
                width: 160, height: 160, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px dashed var(--border)", background: "transparent", cursor: "pointer", fontSize: 24,
                color: "var(--text-muted)"
              }}
              onClick={() => {
                setAddMode(mode.id);
                setShowAddModal(true);
              }}
            >
              +
            </button>
          </div>
        </div>
      ))}

      {showAddModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="panel" style={{ width: 400, maxWidth: "90%" }}>
            <h3>Add Map</h3>
            <form onSubmit={handleAddMap}>
              <div className="field">
                <label>Workshop ID or Link (Optional)</label>
                <input className="input" value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="e.g. 123456789 or URL" />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>Map Name</label>
                <input className="input" value={addMapName} onChange={(e) => setAddMapName(e.target.value)} placeholder="e.g. de_mirage (Optional if Workshop ID provided)" />
              </div>
              {error && <p className="danger" style={{ marginTop: 12, color: "var(--danger)" }}>{error}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={adding}>{adding ? "Adding..." : "Add Map"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
