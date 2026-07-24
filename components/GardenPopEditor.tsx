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
  const [activeTab, setActiveTab] = useState<"hair" | "stache" | "color" | "hairColor">("hair");

  const haircuts = ["none", "punk", "long_01"];
  const staches = ["none", "stache"];
  
  const skinColors = [
    "#fcdbb4", "#e0ac69", "#c68642", "#8d5524", "#4a2a11", 
    "#3498db", "#e74c3c", "#9b59b6", "#2ecc71"
  ];

  const hairColors = [
    "#2c3e50", "#000000", "#e74c3c", "#f1c40f", "#e67e22", 
    "#bdc3c7", "#8e44ad", "#16a085", "#ffb8c6"
  ];

  const handleSave = async () => {
    setSaving(true);
    await onSave(config);
    setSaving(false);
  };

  return (
    <div className="ps-overlays visible" style={{ background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="panel" style={{ width: "800px", maxWidth: "90vw", display: "flex", gap: "30px", padding: "40px" }}>
        
        {/* Left Side: Live 3D Preview */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h2 style={{ marginBottom: "20px", color: "#fff" }}>3D Preview</h2>
          <div style={{ width: "100%", height: "300px", background: "rgba(255,255,255,0.02)", borderRadius: "20px", padding: "10px", overflow: "hidden" }}>
            <GardenPop config={config} cameraDistance={15} enableZoom={true} />
          </div>
          <p style={{ marginTop: "10px", opacity: 0.5, fontSize: "12px" }}>Drag to rotate · Scroll to zoom</p>
        </div>

        {/* Right Side: Editor Controls */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <h2 style={{ marginBottom: "20px", color: "#fff" }}>Customize</h2>
          
          <div style={{ 
            display: "flex", 
            background: "rgba(255,255,255,0.05)", 
            borderRadius: "12px", 
            padding: "4px", 
            marginBottom: "20px" 
          }}>
            {(["color", "hair", "stache", "hairColor"] as const).map((tab) => {
              const labels = { color: "Skin Color", hair: "Haircut", stache: "Facial Hair", hairColor: "Hair Color" };
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    border: "none",
                    background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: isActive ? 600 : 400,
                    transition: "all 0.2s ease"
                  }}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, overflowY: "auto", paddingRight: "10px" }}>
            {activeTab === "hair" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {haircuts.map((opt) => (
                  <button
                    key={opt}
                    className={`btn secondary ${config.hair === opt ? "" : "opacity-50"}`}
                    style={{ 
                      border: config.hair === opt ? "2px solid #a855f7" : "1px solid rgba(255,255,255,0.1)",
                      textTransform: "capitalize",
                      padding: "20px"
                    }}
                    onClick={() => setConfig({ ...config, hair: opt })}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {activeTab === "stache" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {staches.map((opt) => (
                  <button
                    key={opt}
                    className={`btn secondary ${config.stache === opt ? "" : "opacity-50"}`}
                    style={{ 
                      border: config.stache === opt ? "2px solid #a855f7" : "1px solid rgba(255,255,255,0.1)",
                      textTransform: "capitalize",
                      padding: "20px"
                    }}
                    onClick={() => setConfig({ ...config, stache: opt })}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {activeTab === "color" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "15px" }}>
                {skinColors.map((hex) => (
                  <button
                    key={hex}
                    onClick={() => setConfig({ ...config, color: hex })}
                    style={{
                      width: "50px",
                      height: "50px",
                      borderRadius: "50%",
                      background: hex,
                      border: config.color === hex ? "4px solid #fff" : "4px solid transparent",
                      boxShadow: config.color === hex ? "0 0 15px rgba(255,255,255,0.5)" : "none",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    title={hex}
                  />
                ))}
              </div>
            )}

            {activeTab === "hairColor" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "15px" }}>
                {hairColors.map((hex) => (
                  <button
                    key={hex}
                    onClick={() => setConfig({ ...config, hairColor: hex })}
                    style={{
                      width: "50px",
                      height: "50px",
                      borderRadius: "50%",
                      background: hex,
                      border: config.hairColor === hex ? "4px solid #fff" : "4px solid transparent",
                      boxShadow: config.hairColor === hex ? "0 0 15px rgba(255,255,255,0.5)" : "none",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    title={hex}
                  />
                ))}
              </div>
            )}
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
