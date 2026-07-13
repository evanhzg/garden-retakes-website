"use client";

import React, { useState } from "react";
import GardenPop, { GardenPopConfig, defaultPopConfig } from "./GardenPop";

export default function GardenPopEditor({
  initialConfig,
  onSave,
  onCancel,
}: {
  initialConfig?: GardenPopConfig;
  onSave: (config: GardenPopConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [config, setConfig] = useState<GardenPopConfig>(initialConfig || defaultPopConfig);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"base" | "hair" | "clothes" | "eyewear">("base");

  const options = {
    base: ["light", "medium", "dark"],
    hair: ["none", "spiky", "fade", "long"],
    clothes: ["tshirt", "hoodie", "suit"],
    eyewear: ["none", "glasses", "sunglasses"],
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(config);
    setSaving(false);
  };

  return (
    <div className="ps-overlays visible" style={{ background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="panel" style={{ width: "800px", maxWidth: "90vw", display: "flex", gap: "30px", padding: "40px" }}>
        
        {/* Left Side: Live Preview */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h2 style={{ marginBottom: "20px", color: "#fff" }}>Garden-Pop Preview</h2>
          <div style={{ width: "250px", height: "250px", background: "rgba(255,255,255,0.05)", borderRadius: "20px", padding: "20px" }}>
            <GardenPop config={config} />
          </div>
        </div>

        {/* Right Side: Editor Controls */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <h2 style={{ marginBottom: "20px", color: "#fff" }}>Customize</h2>
          
          <div className="chip-row" style={{ marginBottom: "20px" }}>
            {(Object.keys(options) as Array<keyof GardenPopConfig>).map((tab) => (
              <button
                key={tab}
                className={`chip ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
                style={{ textTransform: "capitalize", cursor: "pointer", background: "none", border: "none", color: "inherit", font: "inherit", padding: 0 }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", flex: 1 }}>
            {options[activeTab].map((opt) => (
              <button
                key={opt}
                className={`btn secondary ${config[activeTab] === opt ? "" : "opacity-50"}`}
                style={{ 
                  border: config[activeTab] === opt ? "2px solid #a855f7" : "1px solid rgba(255,255,255,0.1)",
                  textTransform: "capitalize"
                }}
                onClick={() => setConfig({ ...config, [activeTab]: opt })}
              >
                {opt}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "30px" }}>
            <button className="btn" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Avatar"}
            </button>
            <button className="btn secondary" style={{ flex: 1 }} onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
